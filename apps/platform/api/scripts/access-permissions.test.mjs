/**
 * 权限常量与租户可授权范围单元测试。
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
  TENANT_GRANTABLE_PERMISSION_IDS,
  ROLE_DEFAULT_PERMISSIONS,
  expandPermissionGrants,
  listTenantPermissionCatalog,
  buildTenantAccessMeta,
  sanitizeTenantUserGrants,
} = require(resolve(apiRoot, 'dist/modules/access/permission.constants.js'));
const { Role } = require(
  resolve(apiRoot, '../../../packages/shared-core/dist/index.js'),
);

describe('access permissions', () => {
  it('TENANT_GRANTABLE excludes console and seo permissions', () => {
    for (const id of TENANT_GRANTABLE_PERMISSION_IDS) {
      assert.ok(!id.startsWith('console:'), `unexpected console permission: ${id}`);
      assert.ok(!id.startsWith('seo:'), `unexpected seo permission: ${id}`);
    }
    assert.ok(TENANT_GRANTABLE_PERMISSION_IDS.includes('org:member:list'));
    assert.ok(TENANT_GRANTABLE_PERMISSION_IDS.includes('project:read'));
    assert.ok(!TENANT_GRANTABLE_PERMISSION_IDS.includes('org:billing:manage'));
  });

  it('ADMIN role default excludes seo and org billing manage', () => {
    const adminDefaults = ROLE_DEFAULT_PERMISSIONS[Role.ADMIN] ?? [];
    for (const id of adminDefaults) {
      assert.ok(!id.startsWith('seo:'), `ADMIN default should not include ${id}`);
    }
    assert.ok(!adminDefaults.includes('org:billing:manage'));
    assert.ok(adminDefaults.includes('org:billing:read'));
  });

  it('MEMBER role default excludes seo permissions', () => {
    const memberDefaults = ROLE_DEFAULT_PERMISSIONS[Role.MEMBER] ?? [];
    for (const id of memberDefaults) {
      assert.ok(!id.startsWith('seo:'), `MEMBER default should not include ${id}`);
    }
  });

  it('expandPermissionGrants includes implied read permissions', () => {
    const expanded = expandPermissionGrants(['org:profile:update']);
    assert.ok(expanded.includes('org:profile:read'));
    assert.ok(expanded.includes('org:profile:update'));
  });

  it('listTenantPermissionCatalog matches grantable ids', () => {
    const catalog = listTenantPermissionCatalog();
    const ids = new Set(TENANT_GRANTABLE_PERMISSION_IDS);
    assert.equal(catalog.length, ids.size);
    for (const item of catalog) {
      assert.ok(ids.has(item.id));
    }
  });

  it('sanitizeTenantUserGrants strips console, seo and billing manage', () => {
    const input = [
      'org:member:list',
      'project:read',
      'seo:job:create',
      'console:tenant:list',
      'org:billing:manage',
      'unknown:perm',
    ];
    const sanitized = sanitizeTenantUserGrants(input);
    assert.deepEqual(sanitized.sort(), ['org:member:list', 'project:read'].sort());
  });

  it('buildTenantAccessMeta exposes catalog, role defaults and implies', () => {
    const meta = buildTenantAccessMeta();
    assert.ok(meta.permissionCatalog.length > 0);
    assert.ok(meta.roleDefaultPermissions[Role.ADMIN]?.includes('org:profile:read'));
    assert.ok(meta.permissionImplies['org:profile:update']?.includes('org:profile:read'));
  });
});
