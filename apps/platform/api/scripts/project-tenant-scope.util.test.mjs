/**
 * 平台 Console 跨企业项目 org 解析。
 * 用法：cd apps/platform/api && pnpm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const {
  isPlatformConsoleActor,
  resolveProjectOrganizationId,
  lookupProjectOrganizationId,
} = require(resolve(apiRoot, 'dist/modules/project/project-tenant-scope.util.js'));

const PLATFORM_ORG = '00000000-0000-4000-8000-000000000001';
const CUSTOMER_ORG = '00000000-0000-4000-8000-000000000002';
const PROJECT_ID = '00000000-0000-4000-8000-000000000201';

function createPrisma(organizationId) {
  return {
    project: {
      findFirst: async ({ where }) => {
        if (where.id === PROJECT_ID) {
          return { organizationId };
        }
        return null;
      },
    },
  };
}

describe('project-tenant-scope.util', () => {
  it('isPlatformConsoleActor', () => {
    assert.equal(isPlatformConsoleActor('SUPER_ADMIN'), true);
    assert.equal(isPlatformConsoleActor('PLATFORM_OPERATOR'), true);
    assert.equal(isPlatformConsoleActor('ORG_ADMIN'), false);
  });

  it('resolveProjectOrganizationId keeps customer org for normal users', async () => {
    const prisma = createPrisma(CUSTOMER_ORG);
    const orgId = await resolveProjectOrganizationId(
      prisma,
      CUSTOMER_ORG,
      PROJECT_ID,
      { role: 'ORG_ADMIN' },
    );
    assert.equal(orgId, CUSTOMER_ORG);
  });

  it('resolveProjectOrganizationId maps platform org to project tenant', async () => {
    const prisma = createPrisma(CUSTOMER_ORG);
    const orgId = await resolveProjectOrganizationId(
      prisma,
      PLATFORM_ORG,
      PROJECT_ID,
      { role: 'PLATFORM_OPERATOR' },
    );
    assert.equal(orgId, CUSTOMER_ORG);
  });

  it('lookupProjectOrganizationId returns undefined when project missing', async () => {
    const prisma = createPrisma(CUSTOMER_ORG);
    const orgId = await lookupProjectOrganizationId(prisma, 'missing-project');
    assert.equal(orgId, undefined);
  });
});
