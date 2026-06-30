/**
 * 站点服务：项目下站点 CRUD 与列表查询。
 *
 * 边界：
 * - 不负责：页面库同步细节（SitePageService）、Shopify 列表查询（SiteCmsService）
 *
 * 入口：
 * - SiteService
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { RedisService } from '../../../../core/redis/redis.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { AuditService } from '../../../../modules/access/audit.service';
import type { CreateSiteDto } from './dto/create-site.dto';
import type { UpdateSiteDto } from './dto/update-site.dto';
import {
  mergeWordPressCmsConfig,
  mergeShopifyCmsConfig,
  parseShopifyCmsConfig,
  parseWordPressCmsConfig,
  sanitizeCmsForResponse,
} from './site-cms.util';
import { normalizeSiteDomain } from './site-domain.util';
import {
  parseTargetMarkets,
  serializeTargetMarkets,
} from './target-market.util';
import { parseSiteWorkflowSettings } from '../../constants/brief-approval';
import { GscService } from '../gsc/gsc.service';
import { buildSiteGscListSummary } from '../gsc/gsc-site-status.util';
import { EntitlementsService } from '../../../../modules/billing/entitlements.service';
import { resolveSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import {
  mergeSiteContentProfile,
  parseSiteSettings,
  type SiteContentProfile,
} from '../../constants/site-settings';
import { withDefaultSiteUtmProfile } from '../../constants/site-utm-defaults.util';
import {
  mergeSiteSerpResearchSettings,
  type SiteSerpResearchSettings,
} from '../../constants/serp-research-settings';
import type { ListShopifyBlogsDto } from './dto/list-shopify-blogs.dto';
import { findKeywordConflicts } from '../keyword-pool/keyword-cannibalization.util';
import { SiteCmsService } from './site-cms.service';
import { SitePageService } from '../linking/site-page.service';
import {
  buildAttributionCsv,
  resolveAttributionRows,
} from './site-attribution-export.util';

const siteSelect = {
  id: true,
  domain: true,
  brandVoice: true,
  targetMarket: true,
  contentLanguage: true,
  cmsType: true,
  cmsConfig: true,
  settings: true,
  createdAt: true,
  gscConnection: {
    select: {
      propertyUrl: true,
      managedByPlatform: true,
      lastSyncAt: true,
      lastSyncError: true,
    },
  },
} as const;

@Injectable()
export class SiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gscService: GscService,
    private readonly entitlementsService: EntitlementsService,
    private readonly siteCmsService: SiteCmsService,
    private readonly sitePageService: SitePageService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(
    organizationId: string,
    projectId: string,
    options?: { siteOwnerUserId?: string },
  ) {
    const sites = await this.prisma.site.findMany({
      where: { organizationId, projectId },
      select: siteSelect,
      orderBy: { createdAt: 'desc' },
    });

    const filtered = options?.siteOwnerUserId
      ? sites.filter(
          (site) => parseSiteSettings(site.settings).ownerUserId === options.siteOwnerUserId,
        )
      : sites;

    const ent = await this.entitlementsService.getForOrganization(organizationId);

    return filtered.map((site) => this.toPublicSite(site, ent.gscEnabled));
  }

  async listOwnedSiteIds(
    organizationId: string,
    projectId: string,
    ownerUserId: string,
  ): Promise<string[]> {
    const sites = await this.prisma.site.findMany({
      where: { organizationId, projectId },
      select: { id: true, settings: true },
    });
    return sites
      .filter((site) => parseSiteSettings(site.settings).ownerUserId === ownerUserId)
      .map((site) => site.id);
  }

  async exportAttributionCsv(
    organizationId: string,
    projectId: string,
    siteId: string,
  ): Promise<string> {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: { settings: true, domain: true },
    });
    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const jobs = await this.prisma.articleJob.findMany({
      where: { organizationId, projectId, siteId, status: 'COMPLETED' },
      select: {
        id: true,
        targetKeyword: true,
        seoCheckData: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });

    return buildAttributionCsv(resolveAttributionRows(jobs, site.settings, site.domain));
  }

  async findOne(organizationId: string, projectId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: siteSelect,
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const ent = await this.entitlementsService.getForOrganization(organizationId);
    return this.toPublicSite(site, ent.gscEnabled);
  }

  async listShopifyBlogs(
    organizationId: string,
    projectId: string,
    dto: ListShopifyBlogsDto,
  ) {
    return this.siteCmsService.listShopifyBlogs(organizationId, projectId, dto);
  }

  async listShopifyProducts(
    organizationId: string,
    projectId: string,
    dto: ListShopifyBlogsDto,
  ) {
    return this.siteCmsService.listShopifyProducts(organizationId, projectId, dto);
  }

  async create(organizationId: string, projectId: string, dto: CreateSiteDto) {
    const domain = normalizeSiteDomain(dto.domain);
    if (!domain.includes('.')) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请输入有效域名，例如 example.com');
    }

    const existing = await this.prisma.site.findFirst({
      where: { organizationId, projectId, domain },
      select: { id: true },
    });

    if (existing) {
      throw new BusinessException(ErrorCodes.SITE_DOMAIN_EXISTS, '该项目下已存在相同域名');
    }

    const cms = this.resolveCmsDataForWrite(
      dto.cmsType,
      dto.wordpress,
      dto.shopify,
      null,
      null,
    );
    const settings = this.buildSettingsForWrite(
      dto.workflow,
      withDefaultSiteUtmProfile(domain, dto.contentProfile),
      dto.serpResearch,
      parseSiteSettings(null),
    );

    const ent = await this.entitlementsService.getForOrganization(organizationId);

    return this.prisma.site
      .create({
        data: {
          organizationId,
          projectId,
          domain,
          brandVoice: dto.brandVoice?.trim() || null,
          targetMarket: this.resolveTargetMarketForWrite(dto.targetMarkets, dto.targetMarket),
          contentLanguage: dto.contentLanguage ?? 'en',
          cmsType: cms.cmsType,
          cmsConfig: cms.cmsConfig,
          settings,
        },
        select: siteSelect,
      })
      .then((site) => {
        void this.gscService.tryAutoConnectSite({
          organizationId,
          projectId,
          siteId: site.id,
          domain: site.domain,
        });
        void this.sitePageService.tryAutoSyncFromSitemap({
          organizationId,
          projectId,
          siteId: site.id,
          domain: site.domain,
        });
        return this.toPublicSite(site, ent.gscEnabled);
      });
  }

  async update(
    organizationId: string,
    projectId: string,
    siteId: string,
    dto: UpdateSiteDto,
  ) {
    const current = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: siteSelect,
    });

    if (!current) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const data: Prisma.SiteUpdateInput = {};

    if (dto.domain !== undefined) {
      const domain = normalizeSiteDomain(dto.domain);
      if (!domain.includes('.')) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请输入有效域名，例如 example.com');
      }

      const duplicate = await this.prisma.site.findFirst({
        where: {
          organizationId,
          projectId,
          domain,
          NOT: { id: siteId },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new BusinessException(ErrorCodes.SITE_DOMAIN_EXISTS, '该项目下已存在相同域名');
      }

      data.domain = domain;
    }

    if (dto.brandVoice !== undefined) {
      data.brandVoice = dto.brandVoice.trim() || null;
    }

    if (dto.targetMarkets !== undefined || dto.targetMarket !== undefined) {
      data.targetMarket = this.resolveTargetMarketForWrite(dto.targetMarkets, dto.targetMarket);
    }

    if (dto.contentLanguage !== undefined) {
      data.contentLanguage = dto.contentLanguage;
    }

    if (dto.cmsType !== undefined || dto.wordpress !== undefined || dto.shopify !== undefined) {
      const existingWordPress = parseWordPressCmsConfig(current.cmsType, current.cmsConfig);
      const existingShopify = parseShopifyCmsConfig(current.cmsType, current.cmsConfig);
      const cmsType = dto.cmsType === undefined ? current.cmsType : dto.cmsType;

      if (cmsType === null) {
        data.cmsType = null;
        data.cmsConfig = Prisma.DbNull;
      } else if (cmsType === 'wordpress' && dto.wordpress) {
        const cms = this.resolveCmsDataForWrite(
          'wordpress',
          dto.wordpress,
          undefined,
          existingWordPress,
          existingShopify,
        );
        data.cmsType = cms.cmsType;
        data.cmsConfig = cms.cmsConfig;
      } else if (cmsType === 'shopify' && dto.shopify) {
        const cms = this.resolveCmsDataForWrite(
          'shopify',
          undefined,
          dto.shopify,
          existingWordPress,
          existingShopify,
        );
        data.cmsType = cms.cmsType;
        data.cmsConfig = cms.cmsConfig;
      } else if (cmsType === 'wordpress' && !existingWordPress) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写 WordPress REST API 配置');
      } else if (cmsType === 'shopify' && !existingShopify) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写 Shopify Admin API 配置');
      }
    }

    if (
      dto.workflow !== undefined ||
      dto.contentProfile !== undefined ||
      dto.serpResearch !== undefined ||
      dto.ownerUserId !== undefined
    ) {
      const existing = parseSiteSettings(current.settings);
      const baseSettings = this.buildSettingsForWrite(
        dto.workflow,
        dto.contentProfile,
        dto.serpResearch,
        existing,
      ) as Record<string, unknown>;
      if (dto.ownerUserId !== undefined) {
        baseSettings.ownerUserId = dto.ownerUserId?.trim() || undefined;
      }
      data.settings = baseSettings as Prisma.InputJsonValue;
    }

    const ent = await this.entitlementsService.getForOrganization(organizationId);
    const site = await this.prisma.site.update({
      where: { id: siteId },
      data,
      select: siteSelect,
    });

    if (dto.domain !== undefined) {
      void this.gscService.tryAutoConnectSite({
        organizationId,
        projectId,
        siteId: site.id,
        domain: site.domain,
      });
    }

    return this.toPublicSite(site, ent.gscEnabled);
  }

  async clearSerpCache(organizationId: string, projectId: string, siteId: string) {
    await this.findOne(organizationId, projectId, siteId);
    const deleted = await this.redis.clearProjectSerpCache(organizationId, projectId);
    return { deleted };
  }

  private buildSettingsForWrite(
    workflow: CreateSiteDto['workflow'] | undefined,
    contentProfile: CreateSiteDto['contentProfile'] | undefined,
    serpResearch: CreateSiteDto['serpResearch'] | undefined,
    existing: ReturnType<typeof parseSiteSettings>,
  ): Prisma.InputJsonValue {
    const nextProfile = this.mergeContentProfile(existing.contentProfile, contentProfile);
    const nextSerpResearch = this.mergeSerpResearch(existing.serpResearch, serpResearch);

    return {
      requireBriefApproval:
        workflow?.requireBriefApproval ?? existing.requireBriefApproval ?? false,
      enableParaphrase: workflow?.enableParaphrase ?? existing.enableParaphrase ?? true,
      enableIllustration: workflow?.enableIllustration ?? existing.enableIllustration ?? true,
      scoreCalibrationShadow:
        workflow?.scoreCalibrationShadow ?? existing.scoreCalibrationShadow ?? true,
      scoreCalibrationReduceRpa:
        workflow?.scoreCalibrationReduceRpa ?? existing.scoreCalibrationReduceRpa ?? false,
      scoreCalibrationLocalAlign:
        workflow?.scoreCalibrationLocalAlign ?? existing.scoreCalibrationLocalAlign ?? false,
      ...(workflow?.localPassThreshold !== undefined
        ? { localPassThreshold: workflow.localPassThreshold }
        : existing.localPassThreshold !== undefined
          ? { localPassThreshold: existing.localPassThreshold }
          : {}),
      ...(workflow?.semrushPassThreshold !== undefined
        ? { semrushPassThreshold: workflow.semrushPassThreshold }
        : existing.semrushPassThreshold !== undefined
          ? { semrushPassThreshold: existing.semrushPassThreshold }
          : {}),
      ...(workflow?.localMaxOptimizeRounds !== undefined
        ? { localMaxOptimizeRounds: workflow.localMaxOptimizeRounds }
        : existing.localMaxOptimizeRounds !== undefined
          ? { localMaxOptimizeRounds: existing.localMaxOptimizeRounds }
          : {}),
      ...(workflow?.localRetryExtraRounds !== undefined
        ? { localRetryExtraRounds: workflow.localRetryExtraRounds }
        : existing.localRetryExtraRounds !== undefined
          ? { localRetryExtraRounds: existing.localRetryExtraRounds }
          : {}),
      ...(workflow?.semrushMaxOptimizeRounds !== undefined
        ? { semrushMaxOptimizeRounds: workflow.semrushMaxOptimizeRounds }
        : existing.semrushMaxOptimizeRounds !== undefined
          ? { semrushMaxOptimizeRounds: existing.semrushMaxOptimizeRounds }
          : {}),
      ...(workflow?.semrushRetryExtraRounds !== undefined
        ? { semrushRetryExtraRounds: workflow.semrushRetryExtraRounds }
        : existing.semrushRetryExtraRounds !== undefined
          ? { semrushRetryExtraRounds: existing.semrushRetryExtraRounds }
          : {}),
      ...(nextProfile ? { contentProfile: nextProfile } : {}),
      ...(nextSerpResearch ? { serpResearch: nextSerpResearch } : {}),
    } as unknown as Prisma.InputJsonValue;
  }

  private mergeSerpResearch(
    existing: SiteSerpResearchSettings | undefined,
    patch: SiteSerpResearchSettings | undefined,
  ): SiteSerpResearchSettings | undefined {
    return mergeSiteSerpResearchSettings(existing, patch);
  }

  private mergeContentProfile(
    existing: SiteContentProfile | undefined,
    patch: CreateSiteDto['contentProfile'] | undefined,
  ): SiteContentProfile | undefined {
    return mergeSiteContentProfile(existing, patch);
  }

  private resolveCmsDataForWrite(
    cmsType: CreateSiteDto['cmsType'] | UpdateSiteDto['cmsType'] | null | undefined,
    wordpress: CreateSiteDto['wordpress'] | undefined,
    shopify: CreateSiteDto['shopify'] | undefined,
    existingWordPress: ReturnType<typeof parseWordPressCmsConfig>,
    existingShopify: ReturnType<typeof parseShopifyCmsConfig>,
  ): { cmsType: string | null; cmsConfig: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue } {
    if (!cmsType) {
      return { cmsType: null, cmsConfig: Prisma.DbNull };
    }

    if (cmsType === 'wordpress') {
      if (!wordpress) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写 WordPress REST API 配置');
      }
      try {
        const merged = mergeWordPressCmsConfig(wordpress, existingWordPress);
        return {
          cmsType: 'wordpress',
          cmsConfig: merged as unknown as Prisma.InputJsonValue,
        };
      } catch {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'WordPress Application Password 不能为空');
      }
    }

    if (cmsType === 'shopify') {
      if (!shopify) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写 Shopify Admin API 配置');
      }
      try {
        const merged = mergeShopifyCmsConfig(shopify, existingShopify);
        this.assertShopifyConfig(merged);
        return {
          cmsType: 'shopify',
          cmsConfig: merged as unknown as Prisma.InputJsonValue,
        };
      } catch (error) {
        if (error instanceof BusinessException) throw error;
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Shopify Admin API Access Token 不能为空');
      }
    }

    throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '不支持的 CMS 类型');
  }

  private assertShopifyConfig(config: ReturnType<typeof mergeShopifyCmsConfig>) {
    const target = config.publishTarget ?? 'blog';
    if (target === 'product' && !config.productId?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '产品页推送需选择 Shopify Product');
    }
    if (target === 'blog' && !config.blogId?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Blog 推送需选择 Shopify Blog');
    }
  }

  private resolveTargetMarketForWrite(
    targetMarkets?: string[],
    legacyTargetMarket?: string,
  ): string | null {
    if (targetMarkets !== undefined) {
      return serializeTargetMarkets(targetMarkets);
    }
    if (legacyTargetMarket !== undefined) {
      return serializeTargetMarkets(parseTargetMarkets(legacyTargetMarket));
    }
    return null;
  }

  private toPublicSite(
    site: {
      id: string;
      domain: string;
      brandVoice: string | null;
      targetMarket: string | null;
      contentLanguage: string;
      cmsType: string | null;
      cmsConfig: unknown;
      settings: unknown;
      createdAt: Date;
      gscConnection?: {
        propertyUrl: string | null;
        managedByPlatform: boolean;
        lastSyncAt: Date | null;
        lastSyncError: string | null;
      } | null;
    },
    gscEnabled: boolean,
  ) {
    const cms = sanitizeCmsForResponse(site.cmsType, site.cmsConfig);
    const parsed = parseSiteSettings(site.settings);
    const targetMarkets = parseTargetMarkets(site.targetMarket);
    return {
      id: site.id,
      domain: site.domain,
      brandVoice: site.brandVoice,
      targetMarket: site.targetMarket,
      targetMarkets,
      contentLanguage: site.contentLanguage,
      cmsType: cms.cmsType,
      cmsConfig: cms.cmsConfig,
      ownerUserId: parsed.ownerUserId ?? null,
      workflow: {
        ...parseSiteWorkflowSettings(site.settings),
        ...resolveSiteSeoScoreConfig(site.settings),
      },
      contentProfile: parsed.contentProfile,
      serpResearch: parsed.serpResearch,
      gsc: buildSiteGscListSummary(gscEnabled, site.gscConnection),
      createdAt: site.createdAt,
    };
  }

  async findKeywordConflicts(
    organizationId: string,
    projectId: string,
    siteId: string,
    keyword: string,
  ) {
    await this.findOne(organizationId, projectId, siteId);

    const normalized = keyword.trim();
    if (!normalized) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请提供关键词');
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.articleJob.findMany({
      where: {
        organizationId,
        projectId,
        siteId,
        status: { not: 'FAILED' },
      },
      select: {
        id: true,
        targetKeyword: true,
        status: true,
        updatedAt: true,
        seoCheckData: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const candidates = rows
      .filter((row) => {
        if (row.status !== 'COMPLETED') return true;
        if (row.updatedAt < ninetyDaysAgo) return false;
        const postUrl = (
          (row.seoCheckData as { cmsPublish?: { postUrl?: string | null } } | null)?.cmsPublish
            ?.postUrl ?? ''
        ).trim();
        return Boolean(postUrl);
      })
      .map((row) => ({
        jobId: row.id,
        keyword: row.targetKeyword,
        status: row.status,
      }));

    return findKeywordConflicts(normalized, candidates);
  }

  /** 永久删除站点及其页面库、GSC 连接与关联任务（不可恢复） */
  async remove(
    organizationId: string,
    projectId: string,
    siteId: string,
    actor?: { userId: string; traceId?: string },
  ) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: { id: true, domain: true },
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    const jobCount = await this.prisma.articleJob.count({
      where: { organizationId, projectId, siteId },
    });

    await this.prisma.$transaction(async (tx) => {
      if (jobCount > 0) {
        await tx.articleJob.deleteMany({ where: { organizationId, projectId, siteId } });
      }
      await tx.keywordEntry.updateMany({
        where: { organizationId, projectId, siteId },
        data: { siteId: null },
      });
      await tx.site.delete({ where: { id: siteId } });
    });

    if (actor) {
      await this.auditService.log({
        organizationId,
        actorUserId: actor.userId,
        action: 'site.delete',
        targetType: 'Site',
        targetId: siteId,
        metadata: { domain: site.domain, projectId, jobCount },
        traceId: actor.traceId,
      });
    }

    return { id: siteId, domain: site.domain, deleted: true as const, jobCount };
  }
}
