/**
 * Console 全站站点总览：跨租户站点运营视图。
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { resolvePlanEntitlements } from '../billing/plan-entitlements.constants';
import { siteHasWritingProfile } from '../../project-types/seo-factory/constants/site-settings';
import {
  buildSiteGscListSummary,
  type SiteGscListSummary,
} from '../../project-types/seo-factory/modules/gsc/gsc-site-status.util';

export interface ConsoleSiteOverviewRow {
  siteId: string;
  domain: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  projectStatus: string;
  cmsType: string | null;
  cmsConfigured: boolean;
  profileReady: boolean;
  gscEnabled: boolean;
  gsc: SiteGscListSummary;
  jobCount: number;
  createdAt: string;
}

export interface ListConsoleSiteOverviewOptions {
  page?: number;
  limit?: number;
  keyword?: string;
  organizationId?: string;
  projectId?: string;
  profileReady?: 'true' | 'false';
  gscConnected?: 'true' | 'false';
}

@Injectable()
export class ConsoleSiteService {
  constructor(private readonly prisma: PrismaService) {}

  async listOverview(options?: ListConsoleSiteOverviewOptions) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const keyword = options?.keyword?.trim();

    const where: Prisma.SiteWhereInput = {};
    const andFilters: Prisma.SiteWhereInput[] = [];

    if (options?.organizationId) {
      andFilters.push({ organizationId: options.organizationId });
    }
    if (options?.projectId) {
      andFilters.push({ projectId: options.projectId });
    }
    if (keyword) {
      andFilters.push({
        OR: [
          { domain: { contains: keyword, mode: 'insensitive' } },
          { project: { name: { contains: keyword, mode: 'insensitive' } } },
          { project: { organization: { name: { contains: keyword, mode: 'insensitive' } } } },
        ],
      });
    }
    if (options?.gscConnected === 'true') {
      andFilters.push({
        gscConnection: {
          propertyUrl: { not: null },
          managedByPlatform: true,
        },
      });
    } else if (options?.gscConnected === 'false') {
      andFilters.push({
        OR: [
          { gscConnection: null },
          { gscConnection: { OR: [{ propertyUrl: null }, { managedByPlatform: false }] } },
        ],
      });
    }
    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const sites = await this.prisma.site.findMany({
      where,
      select: {
        id: true,
        domain: true,
        organizationId: true,
        projectId: true,
        cmsType: true,
        cmsConfig: true,
        settings: true,
        createdAt: true,
        project: {
          select: {
            name: true,
            status: true,
            organization: { select: { name: true, planName: true } },
          },
        },
        gscConnection: {
          select: {
            propertyUrl: true,
            managedByPlatform: true,
            lastSyncAt: true,
            lastSyncError: true,
          },
        },
        _count: { select: { jobs: true } },
      },
      orderBy: [{ project: { organization: { name: 'asc' } } }, { domain: 'asc' }],
    });

    let rows = sites.map((site) => this.toOverviewRow(site));
    if (options?.profileReady === 'true') {
      rows = rows.filter((row) => row.profileReady);
    } else if (options?.profileReady === 'false') {
      rows = rows.filter((row) => !row.profileReady);
    }

    const total = rows.length;
    const items = rows.slice((page - 1) * limit, page * limit);
    return { items, page, limit, total };
  }

  private toOverviewRow(site: {
    id: string;
    domain: string;
    organizationId: string;
    projectId: string;
    cmsType: string | null;
    cmsConfig: unknown;
    settings: unknown;
    createdAt: Date;
    project: {
      name: string;
      status: string;
      organization: { name: string; planName: string };
    };
    gscConnection: {
      propertyUrl: string | null;
      managedByPlatform: boolean;
      lastSyncAt: Date | null;
      lastSyncError: string | null;
    } | null;
    _count: { jobs: number };
  }): ConsoleSiteOverviewRow {
    const gscEnabled = resolvePlanEntitlements(site.project.organization.planName).gscEnabled;
    const cmsConfigured = Boolean(
      site.cmsType?.trim() && site.cmsConfig && typeof site.cmsConfig === 'object',
    );
    return {
      siteId: site.id,
      domain: site.domain,
      organizationId: site.organizationId,
      organizationName: site.project.organization.name,
      projectId: site.projectId,
      projectName: site.project.name,
      projectStatus: site.project.status,
      cmsType: site.cmsType,
      cmsConfigured,
      profileReady: siteHasWritingProfile(site.settings),
      gscEnabled,
      gsc: buildSiteGscListSummary(gscEnabled, site.gscConnection),
      jobCount: site._count.jobs,
      createdAt: site.createdAt.toISOString(),
    };
  }
}
