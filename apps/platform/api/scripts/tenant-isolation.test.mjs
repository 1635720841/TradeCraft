/**
 * 租户隔离单元测试（ArticleJob / Project）。
 * 用法：cd apps/platform/api && pnpm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { ErrorCodes } = require(resolve(apiRoot, 'dist/core/exceptions/error-codes.js'));
const { ArticleJobService } = require(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/article-job/article-job.service.js'),
);
const { ProjectService } = require(resolve(apiRoot, 'dist/modules/project/project.service.js'));

const ORG_A = '00000000-0000-4000-8000-000000000101';
const ORG_B = '00000000-0000-4000-8000-000000000102';
const PROJECT_A = '00000000-0000-4000-8000-000000000201';
const PROJECT_B = '00000000-0000-4000-8000-000000000202';
const JOB_ID = '00000000-0000-4000-8000-000000000301';

const JOB_ROW = {
  id: JOB_ID,
  traceId: 'tr_tenant_test',
  status: 'COMPLETED',
  targetKeyword: 'tenant isolation',
  semrushScore: 80,
  localSeoScore: 85,
  seoCheckData: {},
  outputUrl: null,
  errorMessage: null,
  serpData: {},
  briefData: {},
  draftData: {},
  siteId: '00000000-0000-4000-8000-000000000401',
  site: { domain: 'example.com', cmsType: null, cmsConfig: null },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const PROJECT_ROW = {
  id: PROJECT_A,
  status: 'ACTIVE',
  projectType: 'seo-factory',
};

function matchesTenant(where, organizationId, projectId, id) {
  if (where.organizationId !== organizationId) return false;
  if (where.projectId !== projectId) return false;
  if (id !== undefined && where.id !== id) return false;
  return true;
}

function createArticleJobPrisma() {
  const calls = { findFirst: [], findMany: [], count: [] };

  return {
    calls,
    articleJob: {
      findFirst: async ({ where, select }) => {
        calls.findFirst.push(where);
        if (matchesTenant(where, ORG_A, PROJECT_A, JOB_ID)) {
          return JOB_ROW;
        }
        return null;
      },
      findMany: async ({ where }) => {
        calls.findMany.push(where);
        if (matchesTenant(where, ORG_A, PROJECT_A)) {
          return [JOB_ROW];
        }
        return [];
      },
      count: async ({ where }) => {
        calls.count.push(where);
        if (matchesTenant(where, ORG_A, PROJECT_A)) {
          return 1;
        }
        return 0;
      },
    },
  };
}

function createProjectPrisma() {
  return {
    project: {
      findFirst: async ({ where }) => {
        if (where.id === PROJECT_A && where.organizationId === ORG_A) {
          return PROJECT_ROW;
        }
        return null;
      },
    },
  };
}

function noopLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

function createArticleJobService(prisma) {
  return new ArticleJobService(prisma, noopLogger(), {}, {}, { add: async () => {} });
}

async function assertBusinessError(promise, expectedCode) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, expectedCode);
    return true;
  });
}

describe('ArticleJobService tenant isolation', () => {
  it('findOne returns job for matching org and project', async () => {
    const prisma = createArticleJobPrisma();
    const service = createArticleJobService(prisma);

    const job = await service.findOne(ORG_A, PROJECT_A, JOB_ID);

    assert.equal(job.id, JOB_ID);
    assert.deepEqual(prisma.calls.findFirst[0], {
      id: JOB_ID,
      organizationId: ORG_A,
      projectId: PROJECT_A,
    });
  });

  it('findOne rejects cross-organization access with JOB_NOT_FOUND', async () => {
    const prisma = createArticleJobPrisma();
    const service = createArticleJobService(prisma);

    await assertBusinessError(
      service.findOne(ORG_B, PROJECT_A, JOB_ID),
      ErrorCodes.JOB_NOT_FOUND,
    );
  });

  it('findOne rejects cross-project access with JOB_NOT_FOUND', async () => {
    const prisma = createArticleJobPrisma();
    const service = createArticleJobService(prisma);

    await assertBusinessError(
      service.findOne(ORG_A, PROJECT_B, JOB_ID),
      ErrorCodes.JOB_NOT_FOUND,
    );
  });

  it('findMany scopes query to organization and project', async () => {
    const prisma = createArticleJobPrisma();
    const service = createArticleJobService(prisma);

    const own = await service.findMany(ORG_A, PROJECT_A, 1, 20);
    assert.equal(own.total, 1);
    assert.equal(own.items.length, 1);
    assert.equal(prisma.calls.findMany[0].organizationId, ORG_A);
    assert.equal(prisma.calls.findMany[0].projectId, PROJECT_A);

    const otherOrg = await service.findMany(ORG_B, PROJECT_A, 1, 20);
    assert.equal(otherOrg.total, 0);
    assert.equal(otherOrg.items.length, 0);
  });
});

describe('ProjectService tenant isolation', () => {
  it('assertAccessible allows project under same organization', async () => {
    const service = new ProjectService(createProjectPrisma());
    const project = await service.assertAccessible(ORG_A, PROJECT_A);
    assert.equal(project.id, PROJECT_A);
  });

  it('assertAccessible rejects cross-organization project with NOT_FOUND', async () => {
    const service = new ProjectService(createProjectPrisma());
    await assertBusinessError(service.assertAccessible(ORG_B, PROJECT_A), ErrorCodes.NOT_FOUND);
  });
});
