/**
 * 通知 listener 单元测试（收件人规则、个人待办计数）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ProjectMemberRole } from '@prisma/client';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { canReceiveJobActionNotifications, resolveMyReviewPendingCount } = require(
  resolve(apiRoot, 'dist/modules/project/project-notification.util.js'),
);
const { appendNotificationLink } = require(
  resolve(apiRoot, 'dist/modules/notification/notification-link.util.js'),
);

describe('notification recipient rules', () => {
  it('reviewer with site manage receives job action notifications', () => {
    assert.equal(
      canReceiveJobActionNotifications(['seo:job:read', 'seo:site:manage'], ProjectMemberRole.EDITOR),
      true,
    );
  });

  it('viewer does not receive job action notifications', () => {
    assert.equal(
      canReceiveJobActionNotifications(['seo:job:read'], ProjectMemberRole.VIEWER),
      false,
    );
  });

  it('owner always receives notifications', () => {
    assert.equal(canReceiveJobActionNotifications([], ProjectMemberRole.OWNER), true);
  });
});

describe('personal review pending count', () => {
  it('returns sum for reviewers', () => {
    assert.equal(
      resolveMyReviewPendingCount(['seo:job:create', 'seo:job:read'], 2, 3),
      5,
    );
  });

  it('returns zero for viewers', () => {
    assert.equal(resolveMyReviewPendingCount(['seo:job:read'], 2, 3), 0);
  });
});

describe('notification link util', () => {
  it('appendNotificationLink adds url when WEB_APP_ORIGIN set', () => {
    const prev = process.env.WEB_APP_ORIGIN;
    process.env.WEB_APP_ORIGIN = 'https://app.example.com';
    try {
      const text = appendNotificationLink(['请处理待办'], '/projects/p1/seo-factory/jobs/j1');
      assert.match(text, /https:\/\/app\.example\.com\/projects\/p1\/seo-factory\/jobs\/j1/);
    } finally {
      if (prev === undefined) delete process.env.WEB_APP_ORIGIN;
      else process.env.WEB_APP_ORIGIN = prev;
    }
  });
});
