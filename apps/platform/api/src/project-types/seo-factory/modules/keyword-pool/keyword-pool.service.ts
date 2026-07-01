/**
 * 关键词池服务：CRUD、批量导入、AI 种子生成、优先级计算与任务入队。
 *
 * 边界：
 * - 不负责：Semrush RPA 写作助手检测
 *
 * 入口：
 * - KeywordPoolService
 */

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  KeywordIntent,
  KeywordSource,
  KeywordStatus,
  Prisma,
} from '@prisma/client';
import {
  KEYWORD_METRICS_PROVIDER,
  LLM_PROVIDER,
  type IKeywordMetricsProvider,
  type ILLMProvider,
} from '@wm/provider-interfaces';
import { PrismaService } from '../../../../core/database/prisma.service';
import { softDeleteTimestamp } from '../../../../core/prisma/prisma-soft-delete.extension';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { ArticleJobService } from '../article-job/article-job.service';
import { MAX_BATCH_JOB_LIMIT } from '../../constants/serp-filter';
import { MAX_BATCH_ACTION_LIMIT } from '../../constants/batch-actions';
import { enrichBrandVoiceForPrompt } from '../../constants/site-settings';
import { formatTargetMarketsForPrompt } from '../site/target-market.util';
import type { CreateKeywordDto } from './dto/create-keyword.dto';
import type { ConfirmKeywordSeedsDto } from './dto/confirm-keyword-seeds.dto';
import type { GenerateKeywordSeedsDto } from './dto/generate-keyword-seeds.dto';
import type { UpdateKeywordDto } from './dto/update-keyword.dto';
import { computeKeywordPriorityScore, KEYWORD_HIGH_PRIORITY_THRESHOLD } from './keyword-priority.util';
import { BillingService } from '../../../../modules/billing/billing.service';
import { EntitlementsService } from '../../../../modules/billing/entitlements.service';
import { GscService } from '../gsc/gsc.service';
import type { GscKeywordInsight } from '../gsc/gsc-keyword-match.util';
import { KeywordClusterService } from './keyword-cluster.service';

const keywordSelect = {
  id: true,
  keyword: true,
  siteId: true,
  clusterId: true,
  cluster: { select: { id: true, name: true } },
  intent: true,
  status: true,
  source: true,
  searchVolume: true,
  keywordDifficulty: true,
  cpc: true,
  businessValueScore: true,
  contentFitScore: true,
  priorityScore: true,
  notes: true,
  lastJobId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class KeywordPoolService {
  private readonly sanitizedProjects = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly articleJobService: ArticleJobService,
    private readonly billingService: BillingService,
    private readonly entitlementsService: EntitlementsService,
    private readonly gscService: GscService,
    private readonly logger: LoggerService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILLMProvider,
    @Inject(KEYWORD_METRICS_PROVIDER)
    private readonly keywordMetricsProvider: IKeywordMetricsProvider,
    @Inject(forwardRef(() => KeywordClusterService))
    private readonly keywordClusterService: KeywordClusterService,
  ) {}

  /** 搜索指标 API 是否已配置（未配置时不写入 Stub 假数据） */
  isKeywordMetricsConfigured(): boolean {
    return Boolean(process.env.SEMRUSH_API_KEY?.trim());
  }

  /** 清除历史 Stub 指标并按当前公式重算优先级（每项目进程内仅执行一次） */
  async sanitizeLegacyMetricsIfNeeded(organizationId: string, projectId: string) {
    if (this.isKeywordMetricsConfigured()) return;

    const cacheKey = `${organizationId}:${projectId}`;
    if (this.sanitizedProjects.has(cacheKey)) return;

    const entries = await this.prisma.keywordEntry.findMany({
      where: { organizationId, projectId },
      select: {
        id: true,
        businessValueScore: true,
        contentFitScore: true,
        priorityScore: true,
        searchVolume: true,
        keywordDifficulty: true,
        cpc: true,
      },
    });

    let updated = 0;
    for (const entry of entries) {
      const priorityScore = computeKeywordPriorityScore({
        businessValueScore: entry.businessValueScore,
        contentFitScore: entry.contentFitScore,
      });
      const needsUpdate =
        entry.searchVolume != null ||
        entry.keywordDifficulty != null ||
        entry.cpc != null ||
        entry.priorityScore !== priorityScore;

      if (!needsUpdate) continue;

      await this.prisma.keywordEntry.update({
        where: { id: entry.id },
        data: {
          searchVolume: null,
          keywordDifficulty: null,
          cpc: null,
          priorityScore,
        },
      });
      updated += 1;
    }

    this.sanitizedProjects.add(cacheKey);

    if (updated > 0) {
      this.logger.info('Keyword stub metrics sanitized', { projectId, updated });
    }
  }

  async findMany(
    organizationId: string,
    projectId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      intent?: string;
      clusterId?: string;
      unclustered?: boolean;
      queueable?: boolean;
      excludeArchived?: boolean;
      gscVerified?: boolean;
    } = {},
  ) {
    await this.sanitizeLegacyMetricsIfNeeded(organizationId, projectId);

    const page = Math.max(options.page ?? 1, 1);
    const maxLimit = options.clusterId ? 200 : 100;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), maxLimit);

    const where: Prisma.KeywordEntryWhereInput = {
      organizationId,
      projectId,
      ...(options.status ? { status: options.status as KeywordStatus } : {}),
      ...(options.intent ? { intent: options.intent as KeywordIntent } : {}),
      ...(options.clusterId ? { clusterId: options.clusterId } : {}),
      ...(options.unclustered ? { clusterId: null } : {}),
      ...(options.queueable
        ? { status: { in: [KeywordStatus.PENDING, KeywordStatus.APPROVED] } }
        : {}),
      ...(options.excludeArchived && !options.status && !options.queueable
        ? { status: { not: KeywordStatus.ARCHIVED } }
        : {}),
    };

    if (options.gscVerified) {
      const allItems = await this.prisma.keywordEntry.findMany({
        where,
        select: keywordSelect,
        orderBy: [{ priorityScore: 'desc' }, { updatedAt: 'desc' }],
        take: 500,
      });
      const enriched = await this.attachGscInsights(organizationId, projectId, allItems);
      const verified = enriched.filter((row) => row.gscInsight && row.gscInsight.status !== 'none');
      const skip = (page - 1) * limit;
      return {
        items: verified.slice(skip, skip + limit),
        total: verified.length,
        page,
        limit,
      };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.keywordEntry.findMany({
        where,
        select: keywordSelect,
        orderBy: [{ priorityScore: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.keywordEntry.count({ where }),
    ]);

    const enrichedItems = await this.attachGscInsights(organizationId, projectId, items);
    return { items: enrichedItems, total, page, limit };
  }

  async listGscDiscoveredQueries(organizationId: string, projectId: string) {
    const ent = await this.entitlementsService.getForOrganization(organizationId);
    if (!ent.gscEnabled) {
      return [];
    }
    return this.gscService.getDiscoveredQueries(organizationId, projectId);
  }

  async importFromGsc(
    organizationId: string,
    projectId: string,
    items: Array<{ query: string; siteId?: string }>,
  ) {
    let skipped = 0;
    const resultItems: Awaited<ReturnType<typeof this.createEntry>>[] = [];

    for (const item of items.slice(0, MAX_BATCH_ACTION_LIMIT)) {
      try {
        const entry = await this.createEntry(
          organizationId,
          projectId,
          {
            keyword: item.query,
            siteId: item.siteId,
            businessValueScore: 0.65,
            contentFitScore: 0.6,
            notes: '来自 Google 搜索表现',
          },
          'GSC' as KeywordSource,
        );
        resultItems.push(entry);
      } catch (error) {
        if (
          error instanceof BusinessException &&
          error.code === ErrorCodes.KEYWORD_EXISTS
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    const enriched = await this.attachGscInsights(organizationId, projectId, resultItems);
    return { created: enriched.length, skipped, items: enriched };
  }

  private async attachGscInsights<T extends { id: string; keyword: string; siteId: string | null; status: string }>(
    organizationId: string,
    projectId: string,
    items: T[],
  ): Promise<Array<T & { gscInsight?: GscKeywordInsight | null }>> {
    if (items.length === 0) return items;

    const ent = await this.entitlementsService.getForOrganization(organizationId);
    if (!ent.gscEnabled) {
      return items.map((row) => ({ ...row, gscInsight: null }));
    }

    const queries = await this.gscService.collectProjectGscQueries(organizationId, projectId);
    if (queries.length === 0) {
      return items.map((row) => ({ ...row, gscInsight: null }));
    }

    const insightMap = this.gscService.buildKeywordGscInsights(items, queries);
    return items.map((row) => ({
      ...row,
      gscInsight: insightMap.get(row.id) ?? null,
    }));
  }

  async getSummary(organizationId: string, projectId: string) {
    await this.sanitizeLegacyMetricsIfNeeded(organizationId, projectId);

    const base = { organizationId, projectId };
    const pendingStatuses = [KeywordStatus.PENDING, KeywordStatus.APPROVED];

    const [queueableCount, unclusteredCount, archivedCount, clusterCount, highPriorityQueueableCount] =
      await Promise.all([
      this.prisma.keywordEntry.count({
        where: { ...base, status: { in: pendingStatuses } },
      }),
      this.prisma.keywordEntry.count({
        where: {
          ...base,
          clusterId: null,
          status: { not: KeywordStatus.ARCHIVED },
        },
      }),
      this.prisma.keywordEntry.count({
        where: { ...base, status: KeywordStatus.ARCHIVED },
      }),
      this.prisma.keywordCluster.count({ where: base }),
      this.prisma.keywordEntry.count({
        where: {
          ...base,
          status: { in: pendingStatuses },
          priorityScore: { gte: KEYWORD_HIGH_PRIORITY_THRESHOLD },
        },
      }),
    ]);

    return {
      queueableCount,
      unclusteredCount,
      archivedCount,
      clusterCount,
      highPriorityQueueableCount,
    };
  }

  async create(organizationId: string, projectId: string, dto: CreateKeywordDto) {
    return this.createEntry(organizationId, projectId, dto, KeywordSource.MANUAL);
  }

  async previewSeeds(
    organizationId: string,
    projectId: string,
    dto: GenerateKeywordSeedsDto,
  ) {
    const site = await this.resolveSiteForSeeds(organizationId, projectId, dto.siteId);
    const seedResult = await this.fetchSeedKeywordsFromLlm(site, dto);

    const normalizedKeywords = seedResult.keywords.map((item) => this.normalizeKeyword(item.keyword));
    const existingRows =
      normalizedKeywords.length > 0
        ? await this.prisma.keywordEntry.findMany({
            where: {
              organizationId,
              projectId,
              OR: normalizedKeywords.map((keyword) => ({
                keyword: { equals: keyword, mode: 'insensitive' as const },
              })),
            },
            select: { keyword: true },
          })
        : [];

    const existingKeys = new Set(existingRows.map((row) => this.keywordKey(row.keyword)));

    const keywords = seedResult.keywords.map((item) => ({
      keyword: this.normalizeKeyword(item.keyword),
      intent: item.intent,
      businessValueScore: item.businessValueScore,
      contentFitScore: item.contentFitScore,
      rationale: item.rationale,
      alreadyExists: existingKeys.has(this.keywordKey(item.keyword)),
    }));

    return {
      siteId: site.id,
      keywords,
      promptVersion: seedResult.promptVersion,
    };
  }

  async confirmSeeds(
    organizationId: string,
    projectId: string,
    dto: ConfirmKeywordSeedsDto,
  ) {
    const site = await this.resolveSiteForSeeds(organizationId, projectId, dto.siteId);

    let created = 0;
    let skipped = 0;
    const items = [];

    for (const seed of dto.keywords) {
      try {
        const row = await this.createEntry(
          organizationId,
          projectId,
          {
            keyword: seed.keyword,
            siteId: site.id,
            intent: seed.intent,
            businessValueScore: seed.businessValueScore,
            contentFitScore: seed.contentFitScore,
            notes: seed.rationale,
          },
          KeywordSource.AI_SEED,
        );
        items.push(row);
        created += 1;
      } catch (error) {
        if (error instanceof BusinessException && error.code === ErrorCodes.KEYWORD_EXISTS) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    this.logger.info('Keyword seeds confirmed', { projectId, created, skipped });

    return { created, skipped, items };
  }

  /** @deprecated 兼容旧调用；请使用 previewSeeds + confirmSeeds */
  async generateSeeds(
    organizationId: string,
    projectId: string,
    dto: GenerateKeywordSeedsDto,
  ) {
    const preview = await this.previewSeeds(organizationId, projectId, dto);
    const confirmed = await this.confirmSeeds(organizationId, projectId, {
      siteId: preview.siteId,
      keywords: preview.keywords.filter((item) => !item.alreadyExists),
    });
    return { ...confirmed, promptVersion: preview.promptVersion };
  }

  private async fetchSeedKeywordsFromLlm(
    site: { id: string; domain: string; brandVoice: string | null; targetMarket: string | null; contentLanguage: string | null; settings: unknown },
    dto: GenerateKeywordSeedsDto,
  ) {
    const count = Math.min(Math.max(dto.count ?? 15, 5), 30);

    return this.llmProvider.generateKeywordSeeds({
      siteDomain: site.domain,
      brandVoice: enrichBrandVoiceForPrompt(site.brandVoice, site.settings) ?? undefined,
      targetMarket: formatTargetMarketsForPrompt(site.targetMarket),
      contentLanguage: site.contentLanguage === 'zh-CN' ? 'zh-CN' : 'en',
      count,
      topicHint: dto.topicHint,
    });
  }

  async enrichMetrics(
    organizationId: string,
    projectId: string,
    options: { ids?: string[]; allMissing?: boolean } = {},
  ) {
    if (!this.isKeywordMetricsConfigured()) {
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        '搜索指标 API 尚未接入，暂不支持回填',
      );
    }

    const where: Prisma.KeywordEntryWhereInput = {
      organizationId,
      projectId,
      ...(options.ids?.length ? { id: { in: options.ids } } : {}),
      ...(options.allMissing
        ? {
            OR: [{ searchVolume: null }, { keywordDifficulty: null }],
          }
        : {}),
    };

    const entries = await this.prisma.keywordEntry.findMany({
      where,
      select: { id: true, keyword: true, searchVolume: true, keywordDifficulty: true, cpc: true, businessValueScore: true, contentFitScore: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    if (entries.length === 0) {
      return { updated: 0, items: [] };
    }

    const metricsList = await this.keywordMetricsProvider.fetchMetrics({
      keywords: entries.map((item) => item.keyword),
    });

    const metricsMap = new Map(
      metricsList.map((item) => [this.keywordKey(item.keyword), item]),
    );

    const updatedItems = [];

    for (const entry of entries) {
      const metrics = metricsMap.get(this.keywordKey(entry.keyword));
      if (!metrics) continue;

      const searchVolume = metrics.searchVolume ?? entry.searchVolume;
      const keywordDifficulty = metrics.keywordDifficulty ?? entry.keywordDifficulty;
      const cpc = metrics.cpc ?? entry.cpc;

      const priorityScore = computeKeywordPriorityScore({
        searchVolume,
        keywordDifficulty,
        businessValueScore: entry.businessValueScore,
        contentFitScore: entry.contentFitScore,
      });

      const row = await this.prisma.keywordEntry.update({
        where: { id: entry.id },
        data: {
          searchVolume,
          keywordDifficulty,
          cpc,
          priorityScore,
        },
        select: keywordSelect,
      });

      updatedItems.push(row);
    }

    return { updated: updatedItems.length, items: updatedItems };
  }

  private async createEntry(
    organizationId: string,
    projectId: string,
    dto: CreateKeywordDto,
    source: KeywordSource,
  ) {
    await this.assertSiteIfProvided(organizationId, projectId, dto.siteId);
    const keyword = this.normalizeKeyword(dto.keyword);

    const clusterId = await this.resolveClusterId(
      organizationId,
      projectId,
      dto.clusterId,
      dto.clusterName,
    );

    const existing = await this.prisma.keywordEntry.findFirst({
      where: {
        projectId,
        keyword: { equals: keyword, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existing) {
      throw new BusinessException(ErrorCodes.KEYWORD_EXISTS, '该项目下已存在相同关键词');
    }

    const priorityScore = computeKeywordPriorityScore({
      businessValueScore: dto.businessValueScore,
      contentFitScore: dto.contentFitScore,
    });

    return this.prisma.keywordEntry.create({
      data: {
        organizationId,
        projectId,
        siteId: dto.siteId ?? null,
        clusterId,
        keyword,
        intent: (dto.intent as KeywordIntent) ?? KeywordIntent.INFORMATIONAL,
        source,
        searchVolume: this.isKeywordMetricsConfigured() ? (dto.searchVolume ?? null) : null,
        keywordDifficulty: this.isKeywordMetricsConfigured()
          ? (dto.keywordDifficulty ?? null)
          : null,
        cpc: this.isKeywordMetricsConfigured() ? (dto.cpc ?? null) : null,
        businessValueScore: dto.businessValueScore ?? 0.5,
        contentFitScore: dto.contentFitScore ?? 0.5,
        priorityScore,
        notes: dto.notes?.trim() || null,
      },
      select: keywordSelect,
    });
  }

  async importMany(organizationId: string, projectId: string, items: CreateKeywordDto[]) {
    let created = 0;
    let skipped = 0;
    const results = [];

    for (const item of items) {
      try {
        const row = await this.createEntry(organizationId, projectId, item, KeywordSource.IMPORT);
        results.push(row);
        created += 1;
      } catch (error) {
        if (error instanceof BusinessException && error.code === ErrorCodes.KEYWORD_EXISTS) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }

    return { created, skipped, items: results };
  }

  async update(
    organizationId: string,
    projectId: string,
    id: string,
    dto: UpdateKeywordDto,
  ) {
    const current = await this.findOne(organizationId, projectId, id);

    if (dto.siteId) {
      await this.assertSiteIfProvided(organizationId, projectId, dto.siteId);
    }

    const clusterId =
      dto.clusterId !== undefined || dto.clusterName !== undefined
        ? await this.resolveClusterId(
            organizationId,
            projectId,
            dto.clusterId,
            dto.clusterName,
            dto.clusterId === null,
          )
        : undefined;

    const businessValueScore = dto.businessValueScore ?? current.businessValueScore;
    const contentFitScore = dto.contentFitScore ?? current.contentFitScore;
    const metricsConfigured = this.isKeywordMetricsConfigured();

    const priorityScore = computeKeywordPriorityScore({
      businessValueScore,
      contentFitScore,
    });

    return this.prisma.keywordEntry.update({
      where: { id },
      data: {
        siteId: dto.siteId === undefined ? undefined : dto.siteId,
        clusterId: clusterId === undefined ? undefined : clusterId,
        intent: dto.intent as KeywordIntent | undefined,
        status: dto.status as KeywordStatus | undefined,
        searchVolume: metricsConfigured
          ? dto.searchVolume === undefined
            ? undefined
            : dto.searchVolume
          : null,
        keywordDifficulty: metricsConfigured
          ? dto.keywordDifficulty === undefined
            ? undefined
            : dto.keywordDifficulty
          : null,
        cpc: metricsConfigured ? (dto.cpc === undefined ? undefined : dto.cpc) : null,
        businessValueScore: dto.businessValueScore,
        contentFitScore: dto.contentFitScore,
        priorityScore,
        notes: dto.notes === undefined ? undefined : dto.notes,
      },
      select: keywordSelect,
    });
  }

  async createJobFromKeyword(
    organizationId: string,
    projectId: string,
    keywordId: string,
    siteId?: string,
  ) {
    const entry = await this.findOne(organizationId, projectId, keywordId);

    if (entry.status === KeywordStatus.ARCHIVED) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '已归档关键词不可创建任务');
    }

    const resolvedSiteId = await this.resolveSiteId(organizationId, projectId, siteId, entry.siteId);

    const site = await this.prisma.site.findFirst({
      where: { id: resolvedSiteId, organizationId, projectId },
      select: { contentLanguage: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const job = await this.articleJobService.create(organizationId, projectId, {
      siteId: resolvedSiteId,
      targetKeyword: entry.keyword,
      contentLanguage: site.contentLanguage === 'zh-CN' ? 'zh-CN' : 'en',
      searchIntent: entry.intent,
    });

    await this.prisma.keywordEntry.update({
      where: { id: keywordId },
      data: {
        status: KeywordStatus.USED,
        lastJobId: job.id,
        siteId: resolvedSiteId,
      },
    });

    return { job, keywordId: entry.id, warnings: job.warnings ?? [] };
  }

  async createJobsFromKeywords(
    organizationId: string,
    projectId: string,
    ids: string[],
    siteId?: string,
  ) {
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length > MAX_BATCH_JOB_LIMIT) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `单次最多入队 ${MAX_BATCH_JOB_LIMIT} 个关键词`,
      );
    }

    const entries = await this.prisma.keywordEntry.findMany({
      where: {
        id: { in: uniqueIds },
        organizationId,
        projectId,
      },
      select: keywordSelect,
    });

    if (entries.length !== uniqueIds.length) {
      throw new BusinessException(ErrorCodes.KEYWORD_NOT_FOUND, '部分关键词不存在或无权访问');
    }

    const archived = entries.filter((entry) => entry.status === KeywordStatus.ARCHIVED);
    const eligible = entries.filter((entry) => entry.status !== KeywordStatus.ARCHIVED);

    if (eligible.length === 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '所选关键词均已归档，无法入队');
    }

    await this.billingService.assertArticleQuota(organizationId, eligible.length);

    const jobs: Array<{ job: Awaited<ReturnType<ArticleJobService['create']>>; keywordId: string }> =
      [];

    for (const entry of eligible) {
      const result = await this.createJobFromKeyword(
        organizationId,
        projectId,
        entry.id,
        siteId,
      );
      jobs.push(result);
    }

    this.logger.info('Batch keyword jobs enqueued', {
      organizationId,
      projectId,
      action: 'keyword_pool.create_jobs_batch',
      requested: uniqueIds.length,
      created: jobs.length,
      skippedArchived: archived.length,
    });

    return {
      created: jobs.length,
      skipped: archived.length,
      jobs,
    };
  }

  async remove(organizationId: string, projectId: string, id: string) {
    const entry = await this.findOne(organizationId, projectId, id);

    await this.prisma.keywordEntry.update({
      where: { id },
      data: { deletedAt: softDeleteTimestamp() },
    });

    return { id: entry.id, keyword: entry.keyword, deleted: true as const };
  }

  async batchRemove(organizationId: string, projectId: string, ids: string[]) {
    if (ids.length > MAX_BATCH_ACTION_LIMIT) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `单次最多删除 ${MAX_BATCH_ACTION_LIMIT} 个关键词`,
      );
    }

    const uniqueIds = [...new Set(ids)];
    const entries = await this.prisma.keywordEntry.findMany({
      where: { id: { in: uniqueIds }, organizationId, projectId },
      select: { id: true },
    });

    if (entries.length !== uniqueIds.length) {
      throw new BusinessException(ErrorCodes.KEYWORD_NOT_FOUND, '部分关键词不存在或无权访问');
    }

    const result = await this.prisma.keywordEntry.updateMany({
      where: { id: { in: uniqueIds }, organizationId, projectId, deletedAt: null },
      data: { deletedAt: softDeleteTimestamp() },
    });

    return { deleted: result.count };
  }

  private async findOne(organizationId: string, projectId: string, id: string) {
    const entry = await this.prisma.keywordEntry.findFirst({
      where: { id, organizationId, projectId },
      select: keywordSelect,
    });

    if (!entry) {
      throw new BusinessException(ErrorCodes.KEYWORD_NOT_FOUND, '关键词不存在');
    }

    return entry;
  }

  private async resolveClusterId(
    organizationId: string,
    projectId: string,
    clusterId?: string | null,
    clusterName?: string,
    clearCluster = false,
  ): Promise<string | null | undefined> {
    if (clearCluster) {
      return null;
    }

    if (clusterId) {
      const cluster = await this.prisma.keywordCluster.findFirst({
        where: { id: clusterId, organizationId, projectId },
        select: { id: true },
      });

      if (!cluster) {
        throw new BusinessException(ErrorCodes.KEYWORD_CLUSTER_NOT_FOUND, '主题集群不存在');
      }

      return cluster.id;
    }

    if (clusterName?.trim()) {
      return this.keywordClusterService.findOrCreateByName(
        organizationId,
        projectId,
        clusterName,
      );
    }

    return undefined;
  }

  private normalizeKeyword(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private keywordKey(value: string): string {
    return this.normalizeKeyword(value).toLowerCase();
  }

  private async resolveSiteForSeeds(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ) {
    if (siteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: siteId, organizationId, projectId },
        select: {
          id: true,
          domain: true,
          brandVoice: true,
          targetMarket: true,
          contentLanguage: true,
          settings: true,
        },
      });

      if (!site) {
        throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
      }

      return site;
    }

    const site = await this.prisma.site.findFirst({
      where: { organizationId, projectId },
      select: {
        id: true,
        domain: true,
        brandVoice: true,
        targetMarket: true,
        contentLanguage: true,
        settings: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '请先创建站点后再生成种子关键词');
    }

    return site;
  }

  private async assertSiteIfProvided(
    organizationId: string,
    projectId: string,
    siteId?: string,
  ): Promise<void> {
    if (!siteId) return;

    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: { id: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }
  }

  private async resolveSiteId(
    organizationId: string,
    projectId: string,
    preferredSiteId?: string,
    entrySiteId?: string | null,
  ): Promise<string> {
    const candidate = preferredSiteId ?? entrySiteId ?? undefined;
    if (candidate) {
      await this.assertSiteIfProvided(organizationId, projectId, candidate);
      return candidate;
    }

    const site = await this.prisma.site.findFirst({
      where: { organizationId, projectId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '请先创建站点后再从关键词入队');
    }

    return site.id;
  }
}
