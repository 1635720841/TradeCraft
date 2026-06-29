/**
 * 项目准入元数据单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ProjectMemberRole } from '@prisma/client';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { resolveProjectListAccessMeta } = require(
  resolve(apiRoot, 'dist/modules/project/project-access.constants.js'),
);

describe('project access meta', () => {
  it('owner member with active access can enter project', () => {
    const meta = resolveProjectListAccessMeta({
      status: 'ACTIVE',
      accessStart: null,
      accessEnd: null,
      isOrgAdmin: false,
      isSuperAdmin: false,
      member: {
        role: ProjectMemberRole.OWNER,
        accessStart: null,
        accessEnd: null,
      },
    });
    assert.equal(meta.canEnter, true);
    assert.equal(meta.myAccessStatus, 'usable');
  });

  it('org admin without membership cannot enter but can manage', () => {
    const meta = resolveProjectListAccessMeta({
      status: 'ACTIVE',
      accessStart: null,
      accessEnd: null,
      isOrgAdmin: true,
      isSuperAdmin: false,
      member: null,
    });
    assert.equal(meta.canEnter, false);
    assert.equal(meta.canManage, true);
    assert.equal(meta.myAccessStatus, 'not_member');
  });
});
