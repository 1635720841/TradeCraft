/**
 * 站点服务：项目下站点 CRUD 与列表查询。
 *
 * 边界：
 * - 不负责：页面库同步（SitePageService）
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
import type { CreateSiteDto } from './dto/create-site.dto';
import type { UpdateSiteDto } from './dto/update-site.dto';
import {
  mergeWordPressCmsConfig,
  mergeShopifyCmsConfig,
  getShopifyApiVersion,
  normalizeShopifyDomain,
  parseShopifyCmsConfig,
  parseWordPressCmsConfig,
  sanitizeCmsForResponse,
} from './site-cms.util';
import { normalizeSiteDomain } from './site-domain.util';
import { parseSiteWorkflowSettings } from '../../constants/brief-approval';
import { resolveSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import {
  mergeSiteContentProfile,
  parseSiteSettings,
  type SiteContentProfile,
} from '../../constants/site-settings';
import {
  mergeSiteSerpResearchSettings,
  type SiteSerpResearchSettings,
} from '../../constants/serp-research-settings';
import { fetchWithRetry } from '../../../../core/http/http-fetch';
import type { ListShopifyBlogsDto } from './dto/list-shopify-blogs.dto';
import { findKeywordConflicts } from '../keyword-pool/keyword-cannibalization.util';
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
} as const;

@Injectable()
export class SiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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

    return filtered.map((site) => this.toPublicSite(site));
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
      select: { settings: true },
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

    return buildAttributionCsv(resolveAttributionRows(jobs, site.settings));
  }

  async findOne(organizationId: string, projectId: string, siteId: string) {
    const site = await this.prisma.site.findFirst({
      where: { id: siteId, organizationId, projectId },
      select: siteSelect,
    });

    if (!site) {
      throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
    }

    return this.toPublicSite(site);
  }

  async listShopifyBlogs(
    organizationId: string,
    projectId: string,
    dto: ListShopifyBlogsDto,
  ): Promise<Array<{ id: string; title: string; handle: string }>> {
    let shopDomain = dto.shopDomain?.trim();
    let accessToken = dto.accessToken?.trim();

    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, organizationId, projectId },
        select: { cmsType: true, cmsConfig: true },
      });

      if (!site) {
        throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
      }
      if (site.cmsType !== 'shopify') {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '该站点未配置 Shopify');
      }

      const parsed = parseShopifyCmsConfig('shopify', site.cmsConfig);
      if (!parsed) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Shopify 配置不完整');
      }

      shopDomain = shopDomain || parsed.shopDomain;
      accessToken = accessToken || parsed.accessToken;
    }

    if (!shopDomain || !accessToken) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写店铺域名与 Admin API Token');
    }

    const normalizedDomain = normalizeShopifyDomain(shopDomain);
    const apiVersion = getShopifyApiVersion();
    const response = await fetchWithRetry(
      `https://${normalizedDomain}/admin/api/${apiVersion}/blogs.json`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      },
      { label: 'Shopify Admin API' },
    );

    const bodyText = await response.text();
    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `Shopify 读取 Blog 列表失败（${response.status}）`,
      );
    }

    const payload = bodyText
      ? (JSON.parse(bodyText) as {
          blogs?: Array<{ id: number; title: string; handle: string }>;
        })
      : {};

    return (payload.blogs ?? []).map((blog) => ({
      id: String(blog.id),
      title: blog.title,
      handle: blog.handle,
    }));
  }

  async listShopifyProducts(
    organizationId: string,
    projectId: string,
    dto: ListShopifyBlogsDto,
  ): Promise<Array<{ id: string; title: string; handle: string; status: string }>> {
    let shopDomain = dto.shopDomain?.trim();
    let accessToken = dto.accessToken?.trim();

    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, organizationId, projectId },
        select: { cmsType: true, cmsConfig: true },
      });

      if (!site) {
        throw new BusinessException(ErrorCodes.SITE_NOT_FOUND, '站点不存在');
      }
      if (site.cmsType !== 'shopify') {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '该站点未配置 Shopify');
      }

      const parsed = parseShopifyCmsConfig('shopify', site.cmsConfig);
      if (!parsed) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'Shopify 配置不完整');
      }

      shopDomain = shopDomain || parsed.shopDomain;
      accessToken = accessToken || parsed.accessToken;
    }

    if (!shopDomain || !accessToken) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写店铺域名与 Admin API Token');
    }

    const normalizedDomain = normalizeShopifyDomain(shopDomain);
    const apiVersion = getShopifyApiVersion();
    const response = await fetchWithRetry(
      `https://${normalizedDomain}/admin/api/${apiVersion}/products.json?limit=50&fields=id,title,handle,status`,
      {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      },
      { label: 'Shopify Admin API' },
    );

    const bodyText = await response.text();
    if (!response.ok) {
      throw new BusinessException(
        ErrorCodes.CMS_PUBLISH_FAILED,
        `Shopify 读取 Product 列表失败（${response.status}）`,
      );
    }

    const payload = bodyText
      ? (JSON.parse(bodyText) as {
          products?: Array<{ id: number; title: string; handle: string; status: string }>;
        })
      : {};

    return (payload.products ?? []).map((product) => ({
      id: String(product.id),
      title: product.title,
      handle: product.handle,
      status: product.status,
    }));
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
      dto.contentProfile,
      dto.serpResearch,
      parseSiteSettings(null),
    );

    return this.prisma.site
      .create({
        data: {
          organizationId,
          projectId,
          domain,
          brandVoice: dto.brandVoice?.trim() || null,
          targetMarket: dto.targetMarket?.trim() || null,
          contentLanguage: dto.contentLanguage ?? 'en',
          cmsType: cms.cmsType,
          cmsConfig: cms.cmsConfig,
          settings,
        },
        select: siteSelect,
      })
      .then((site) => this.toPublicSite(site));
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

    if (dto.targetMarket !== undefined) {
      data.targetMarket = dto.targetMarket.trim() || null;
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

    const site = await this.prisma.site.update({
      where: { id: siteId },
      data,
      select: siteSelect,
    });

    return this.toPublicSite(site);
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

  private toPublicSite(site: {
    id: string;
    domain: string;
    brandVoice: string | null;
    targetMarket: string | null;
    contentLanguage: string;
    cmsType: string | null;
    cmsConfig: unknown;
    settings: unknown;
    createdAt: Date;
  }) {
    const cms = sanitizeCmsForResponse(site.cmsType, site.cmsConfig);
    const parsed = parseSiteSettings(site.settings);
    return {
      id: site.id,
      domain: site.domain,
      brandVoice: site.brandVoice,
      targetMarket: site.targetMarket,
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
}
