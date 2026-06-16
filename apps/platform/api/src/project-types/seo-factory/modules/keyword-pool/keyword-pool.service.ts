/**
 * 关键词池服务：CRUD、批量导入、AI 种子生成、Semrush 指标回填、优先级计算与任务入队。
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
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { ArticleJobService } from '../article-job/article-job.service';
import { MAX_BATCH_JOB_LIMIT } from '../../constants/serp-filter';
import { enrichBrandVoiceForPrompt } from '../../constants/site-settings';
import type { CreateKeywordDto } from './dto/create-keyword.dto';
import type { GenerateKeywordSeedsDto } from './dto/generate-keyword-seeds.dto';
import type { UpdateKeywordDto } from './dto/update-keyword.dto';
import { computeKeywordPriorityScore } from './keyword-priority.util';
import { BillingService } from '../../../../modules/billing/billing.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly articleJobService: ArticleJobService,
    private readonly billingService: BillingService,
    private readonly logger: LoggerService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILLMProvider,
    @Inject(KEYWORD_METRICS_PROVIDER)
    private readonly keywordMetricsProvider: IKeywordMetricsProvider,
    @Inject(forwardRef(() => KeywordClusterService))
    private readonly keywordClusterService: KeywordClusterService,
  ) {}

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
    } = {},
  ) {
    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const skip = (page - 1) * limit;

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
    };

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

    return { items, total, page, limit };
  }

  async create(organizationId: string, projectId: string, dto: CreateKeywordDto) {
    return this.createEntry(organizationId, projectId, dto, KeywordSource.MANUAL);
  }

  async generateSeeds(
    organizationId: string,
    projectId: string,
    dto: GenerateKeywordSeedsDto,
  ) {
    const site = await this.resolveSiteForSeeds(organizationId, projectId, dto.siteId);
    const count = Math.min(Math.max(dto.count ?? 15, 5), 30);

    const seedResult = await this.llmProvider.generateKeywordSeeds({
      siteDomain: site.domain,
      brandVoice: enrichBrandVoiceForPrompt(site.brandVoice, site.settings) ?? undefined,
      targetMarket: site.targetMarket ?? undefined,
      contentLanguage: site.contentLanguage === 'zh-CN' ? 'zh-CN' : 'en',
      count,
      topicHint: dto.topicHint,
    });

    let created = 0;
    let skipped = 0;
    const items = [];

    for (const seed of seedResult.keywords) {
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

    this.logger.info('Keyword seeds generated', {
      projectId,
      created,
      skipped,
      promptVersion: seedResult.promptVersion,
    });

    return { created, skipped, items, promptVersion: seedResult.promptVersion };
  }

  async enrichMetrics(
    organizationId: string,
    projectId: string,
    options: { ids?: string[]; allMissing?: boolean } = {},
  ) {
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
      searchVolume: dto.searchVolume,
      keywordDifficulty: dto.keywordDifficulty,
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
        searchVolume: dto.searchVolume ?? null,
        keywordDifficulty: dto.keywordDifficulty ?? null,
        cpc: dto.cpc ?? null,
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

    const searchVolume = dto.searchVolume === undefined ? current.searchVolume : dto.searchVolume;
    const keywordDifficulty =
      dto.keywordDifficulty === undefined ? current.keywordDifficulty : dto.keywordDifficulty;
    const businessValueScore = dto.businessValueScore ?? current.businessValueScore;
    const contentFitScore = dto.contentFitScore ?? current.contentFitScore;

    const priorityScore = computeKeywordPriorityScore({
      searchVolume,
      keywordDifficulty,
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
        searchVolume: dto.searchVolume === undefined ? undefined : dto.searchVolume,
        keywordDifficulty:
          dto.keywordDifficulty === undefined ? undefined : dto.keywordDifficulty,
        cpc: dto.cpc === undefined ? undefined : dto.cpc,
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
