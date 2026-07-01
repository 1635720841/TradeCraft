/**
 * Console 站点列表共用 Prisma where 构建（keyword / org / project / GSC 连接状态）。
 */

import type { Prisma } from '@prisma/client';

export interface ConsoleSiteQueryFilters {
  keyword?: string;
  organizationId?: string;
  projectId?: string;
  gscConnected?: 'true' | 'false';
}

export function buildConsoleSiteWhere(filters?: ConsoleSiteQueryFilters): Prisma.SiteWhereInput {
  const keyword = filters?.keyword?.trim();
  const where: Prisma.SiteWhereInput = {};
  const andFilters: Prisma.SiteWhereInput[] = [];

  if (filters?.organizationId) {
    andFilters.push({ organizationId: filters.organizationId });
  }
  if (filters?.projectId) {
    andFilters.push({ projectId: filters.projectId });
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
  if (filters?.gscConnected === 'true') {
    andFilters.push({
      gscConnection: {
        propertyUrl: { not: null },
        managedByPlatform: true,
      },
    });
  } else if (filters?.gscConnected === 'false') {
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
  return where;
}

export function buildConsoleGscSiteWhere(options?: {
  keyword?: string;
  connected?: 'true' | 'false';
}): Prisma.SiteWhereInput {
  return buildConsoleSiteWhere({
    keyword: options?.keyword,
    gscConnected: options?.connected,
  });
}
