/**
 * OrganizationMemberService 单元测试：分页与租户隔离。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { OrganizationMemberService } = require(
  resolve(apiRoot, 'dist/modules/organization/organization-member.service.js'),
);
const { ErrorCodes } = require(resolve(apiRoot, 'dist/core/exceptions/error-codes.js'));

const ORG_A = '00000000-0000-4000-8000-000000000101';
const ORG_B = '00000000-0000-4000-8000-000000000102';
const MEMBER_ID = '00000000-0000-4000-8000-000000000201';

function createUsers() {
  return [
    {
      id: MEMBER_ID,
      organizationId: ORG_A,
      email: 'member-a@example.com',
      name: 'Member A',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      organizationId: ORG_A,
      email: 'member-a2@example.com',
      name: 'Member A2',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];
}

function createPrisma(users) {
  return {
    user: {
      count: async ({ where }) =>
        users.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (where.role?.notIn?.includes(row.role)) return false;
          return true;
        }).length,
      findMany: async ({ where, skip, take }) =>
        users
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.role?.notIn?.includes(row.role)) return false;
            return true;
          })
          .slice(skip ?? 0, (skip ?? 0) + (take ?? users.length)),
      findFirst: async ({ where }) =>
        users.find(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            (!where.role?.notIn || !where.role.notIn.includes(row.role)),
        ) ?? null,
    },
  };
}

function createService(prisma) {
  const profileService = { ensureOrganization: async () => {} };
  return new OrganizationMemberService(
    prisma,
    { hashPassword: () => 'hash' },
    { getUserPermissions: async () => [], setUserPermissions: async () => ({}) },
    { log: async () => {} },
    profileService,
  );
}

describe('OrganizationMemberService.listMembers', () => {
  it('returns paginated members for organization', async () => {
    const users = createUsers();
    const prisma = createPrisma(users);
    const service = createService(prisma);

    const page1 = await service.listMembers(ORG_A, undefined, { page: 1, limit: 1 });
    assert.equal(page1.total, 2);
    assert.equal(page1.items.length, 1);
    assert.equal(page1.page, 1);
    assert.equal(page1.limit, 1);

    const page2 = await service.listMembers(ORG_A, undefined, { page: 2, limit: 1 });
    assert.equal(page2.items.length, 1);
    assert.notEqual(page1.items[0].id, page2.items[0].id);
  });

  it('returns empty list for other organization', async () => {
    const users = createUsers();
    const prisma = createPrisma(users);
    const service = createService(prisma);

    const result = await service.listMembers(ORG_B, undefined, { page: 1, limit: 20 });
    assert.equal(result.total, 0);
    assert.equal(result.items.length, 0);
  });
});

describe('OrganizationMemberService tenant isolation', () => {
  it('updateMember rejects member from other organization', async () => {
    const users = createUsers();
    const prisma = createPrisma(users);
    const service = createService(prisma);

    await assert.rejects(
      () => service.updateMember(ORG_B, 'actor-1', 'tr_member', MEMBER_ID, { name: 'X' }),
      (err) => {
        assert.equal(err.code, ErrorCodes.MEMBER_NOT_FOUND);
        return true;
      },
    );
  });
});
