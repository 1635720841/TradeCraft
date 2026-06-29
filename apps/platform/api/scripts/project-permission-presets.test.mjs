/**
 * 项目权限预设单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const {
  resolvePresetPermissions,
  listPermissionPresets,
} = require(resolve(apiRoot, 'dist/modules/project/project-permission-presets.js'));

describe('project-permission-presets', () => {
  it('reviewer preset includes seo:job:review for approve/publish', () => {
    const perms = resolvePresetPermissions('reviewer');
    assert.ok(perms.includes('seo:job:read'));
    assert.ok(perms.includes('seo:job:review'));
    assert.ok(perms.includes('seo:site:manage'));
    assert.ok(!perms.includes('seo:job:create'));
    assert.ok(!perms.includes('seo:keyword:manage'));
  });

  it('executor preset includes keyword manage but not review or site manage', () => {
    const perms = resolvePresetPermissions('executor');
    assert.ok(perms.includes('seo:job:create'));
    assert.ok(perms.includes('seo:keyword:manage'));
    assert.ok(!perms.includes('seo:site:manage'));
    assert.ok(!perms.includes('seo:job:review'));
  });

  it('viewer preset is read-only', () => {
    const perms = resolvePresetPermissions('viewer');
    assert.deepEqual(perms, ['seo:job:read']);
  });

  it('content_editor alias maps to executor permissions', () => {
    assert.deepEqual(resolvePresetPermissions('content_editor'), resolvePresetPermissions('executor'));
  });

  it('listPermissionPresets exposes three roles with descriptions', () => {
    const presets = listPermissionPresets();
    assert.equal(presets.length, 3);
    assert.ok(presets.every((p) => typeof p.description === 'string' && p.description.length > 0));
    assert.deepEqual(
      presets.map((p) => p.id).sort(),
      ['executor', 'reviewer', 'viewer'],
    );
  });
});
