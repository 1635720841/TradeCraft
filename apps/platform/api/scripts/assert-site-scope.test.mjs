/**
 * assertSiteScope 单元测试。
 * 用法：cd apps/platform/api && pnpm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { ErrorCodes } = require(resolve(apiRoot, 'dist/core/exceptions/error-codes.js'));
const { assertSiteScope } = require(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/assert-site-scope.util.js'),
);

const ORG_A = '00000000-0000-4000-8000-000000000101';
const ORG_B = '00000000-0000-4000-8000-000000000102';
const PROJECT_A = '00000000-0000-4000-8000-000000000201';
const SITE_A = '00000000-0000-4000-8000-000000000401';

function createPrisma(siteRow) {
  return {
    site: {
      findFirst: async ({ where }) => {
        if (
          where.id === SITE_A &&
          where.organizationId === ORG_A &&
          where.projectId === PROJECT_A
        ) {
          return siteRow;
        }
        return null;
      },
    },
  };
}

async function assertSiteNotFound(promise) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, ErrorCodes.SITE_NOT_FOUND);
    return true;
  });
}

describe('assertSiteScope', () => {
  it('returns site when org, project and site match', async () => {
    const prisma = createPrisma({ id: SITE_A });
    const site = await assertSiteScope(prisma, ORG_A, PROJECT_A, SITE_A);
    assert.equal(site.id, SITE_A);
  });

  it('rejects cross-organization access', async () => {
    const prisma = createPrisma({ id: SITE_A });
    await assertSiteNotFound(assertSiteScope(prisma, ORG_B, PROJECT_A, SITE_A));
  });

  it('rejects cross-project access', async () => {
    const prisma = createPrisma({ id: SITE_A });
    await assertSiteNotFound(
      assertSiteScope(prisma, ORG_A, '00000000-0000-4000-8000-000000000299', SITE_A),
    );
  });

  it('rejects unknown site id', async () => {
    const prisma = createPrisma({ id: SITE_A });
    await assertSiteNotFound(
      assertSiteScope(prisma, ORG_A, PROJECT_A, '00000000-0000-4000-8000-000000000499'),
    );
  });
});
