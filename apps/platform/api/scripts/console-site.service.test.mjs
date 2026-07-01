/**
 * ConsoleSiteService 单元测试：DB 分页与 profileReady 过滤。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ConsoleSiteService } = require(resolve(apiRoot, 'dist/modules/console/console-site.service.js'));

function makeSite(id, profileReady) {
  const settings = profileReady
    ? {
        contentProfile: {
          industry: 'Manufacturing',
          productLines: 'Widgets',
        },
      }
    : {};
  return {
    id,
    domain: `${id}.example.com`,
    organizationId: 'org-1',
    projectId: 'proj-1',
    cmsType: null,
    cmsConfig: null,
    settings,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    project: {
      name: 'Project',
      status: 'ACTIVE',
      organization: { name: 'Org', planName: 'standard' },
    },
    gscConnection: null,
    _count: { jobs: 0 },
  };
}

function createPrisma(sites) {
  return {
    site: {
      count: async () => sites.length,
      findMany: async ({ skip, take }) => {
        const slice = sites.slice(skip ?? 0, (skip ?? 0) + (take ?? sites.length));
        return slice;
      },
    },
  };
}

describe('ConsoleSiteService.listOverview', () => {
  it('paginates in database when profileReady filter is absent', async () => {
    const sites = [makeSite('s1', true), makeSite('s2', false), makeSite('s3', true)];
    const prisma = createPrisma(sites);
    const service = new ConsoleSiteService(prisma);

    const page1 = await service.listOverview({ page: 1, limit: 2 });
    assert.equal(page1.total, 3);
    assert.equal(page1.items.length, 2);

    const page2 = await service.listOverview({ page: 2, limit: 2 });
    assert.equal(page2.items.length, 1);
  });

  it('filters profileReady in memory with correct total', async () => {
    const sites = [makeSite('s1', true), makeSite('s2', false), makeSite('s3', true)];
    const prisma = {
      site: {
        findMany: async () => sites,
      },
    };
    const service = new ConsoleSiteService(prisma);

    const result = await service.listOverview({ profileReady: 'true', page: 1, limit: 10 });
    assert.equal(result.total, 2);
    assert.equal(result.items.length, 2);
    assert.ok(result.items.every((row) => row.profileReady));
  });
});
