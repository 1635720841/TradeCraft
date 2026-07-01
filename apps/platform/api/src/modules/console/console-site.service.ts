/**
 * Console 全站站点总览：跨租户站点运营视图。
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { buildConsoleSiteWhere } from './console-site-query.util';
import {
  mapConsoleSiteOverviewRow,
  type ConsoleSiteOverviewRow,
} from './console-site-mapper.util';

export type { ConsoleSiteOverviewRow };

export interface ListConsoleSiteOverviewOptions {
  page?: number;
  limit?: number;
  keyword?: string;
  organizationId?: string;
  projectId?: string;
  profileReady?: 'true' | 'false';
  gscConnected?: 'true' | 'false';
}

const SITE_OVERVIEW_SELECT = {
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
} satisfies Prisma.SiteSelect;

@Injectable()
export class ConsoleSiteService {
  constructor(private readonly prisma: PrismaService) {}

  async listOverview(options?: ListConsoleSiteOverviewOptions) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const where = buildConsoleSiteWhere({
      keyword: options?.keyword,
      organizationId: options?.organizationId,
      projectId: options?.projectId,
      gscConnected: options?.gscConnected,
    });

    if (options?.profileReady === 'true' || options?.profileReady === 'false') {
      const sites = await this.prisma.site.findMany({
        where,
        select: SITE_OVERVIEW_SELECT,
        orderBy: [{ project: { organization: { name: 'asc' } } }, { domain: 'asc' }],
      });
      let rows = sites.map((site) => mapConsoleSiteOverviewRow(site));
      if (options.profileReady === 'true') {
        rows = rows.filter((row) => row.profileReady);
      } else {
        rows = rows.filter((row) => !row.profileReady);
      }
      const total = rows.length;
      const items = rows.slice((page - 1) * limit, page * limit);
      return { items, page, limit, total };
    }

    const [total, sites] = await Promise.all([
      this.prisma.site.count({ where }),
      this.prisma.site.findMany({
        where,
        select: SITE_OVERVIEW_SELECT,
        orderBy: [{ project: { organization: { name: 'asc' } } }, { domain: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: sites.map((site) => mapConsoleSiteOverviewRow(site)),
      page,
      limit,
      total,
    };
  }
}
