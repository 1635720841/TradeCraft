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
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import type { CreateSiteDto } from './dto/create-site.dto';
import type { UpdateSiteDto } from './dto/update-site.dto';
import {
  mergeWordPressCmsConfig,
  parseWordPressCmsConfig,
  sanitizeCmsForResponse,
} from './site-cms.util';
import { normalizeSiteDomain } from './site-domain.util';

const siteSelect = {
  id: true,
  domain: true,
  brandVoice: true,
  targetMarket: true,
  contentLanguage: true,
  cmsType: true,
  cmsConfig: true,
  createdAt: true,
} as const;

@Injectable()
export class SiteService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(organizationId: string, projectId: string) {
    const sites = await this.prisma.site.findMany({
      where: { organizationId, projectId },
      select: siteSelect,
      orderBy: { createdAt: 'desc' },
    });

    return sites.map((site) => this.toPublicSite(site));
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

    const cms = this.resolveCmsDataForWrite(dto.cmsType, dto.wordpress, null);

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

    if (dto.cmsType !== undefined || dto.wordpress !== undefined) {
      const existingConfig = parseWordPressCmsConfig(current.cmsType, current.cmsConfig);
      const cmsType = dto.cmsType === undefined ? current.cmsType : dto.cmsType;

      if (cmsType === null) {
        data.cmsType = null;
        data.cmsConfig = Prisma.DbNull;
      } else if (dto.wordpress) {
        const cms = this.resolveCmsDataForWrite('wordpress', dto.wordpress, existingConfig);
        data.cmsType = cms.cmsType;
        data.cmsConfig = cms.cmsConfig;
      } else if (dto.cmsType === 'wordpress' && !existingConfig) {
        throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写 WordPress REST API 配置');
      }
    }

    const site = await this.prisma.site.update({
      where: { id: siteId },
      data,
      select: siteSelect,
    });

    return this.toPublicSite(site);
  }

  private resolveCmsDataForWrite(
    cmsType: CreateSiteDto['cmsType'] | UpdateSiteDto['cmsType'] | null | undefined,
    wordpress: CreateSiteDto['wordpress'] | undefined,
    existing: ReturnType<typeof parseWordPressCmsConfig>,
  ): { cmsType: string | null; cmsConfig: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue } {
    if (!cmsType) {
      return { cmsType: null, cmsConfig: Prisma.DbNull };
    }

    if (cmsType !== 'wordpress' || !wordpress) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请填写 WordPress REST API 配置');
    }

    try {
      const merged = mergeWordPressCmsConfig(wordpress, existing);
      return {
        cmsType: 'wordpress',
        cmsConfig: merged as unknown as Prisma.InputJsonValue,
      };
    } catch {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, 'WordPress Application Password 不能为空');
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
    createdAt: Date;
  }) {
    const cms = sanitizeCmsForResponse(site.cmsType, site.cmsConfig);
    return {
      id: site.id,
      domain: site.domain,
      brandVoice: site.brandVoice,
      targetMarket: site.targetMarket,
      contentLanguage: site.contentLanguage,
      cmsType: cms.cmsType,
      cmsConfig: cms.cmsConfig,
      createdAt: site.createdAt,
    };
  }
}
