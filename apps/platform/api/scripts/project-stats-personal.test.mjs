/**
 * 概览个人待办计数逻辑单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const { resolveMyReviewPendingCount, canReviewInSeoProject } = require(
  resolve(apiRoot, 'dist/modules/project/project-notification.util.js'),
);

describe('project stats personal todos', () => {
  it('canReviewInSeoProject accepts review or site manage', () => {
    assert.equal(canReviewInSeoProject(['seo:job:review']), true);
    assert.equal(canReviewInSeoProject(['seo:site:manage']), true);
    assert.equal(canReviewInSeoProject(['seo:job:create']), false);
    assert.equal(canReviewInSeoProject(['seo:job:read']), false);
  });

  it('resolveMyReviewPendingCount sums brief and review for reviewers', () => {
    assert.equal(resolveMyReviewPendingCount(['seo:job:review'], 2, 1), 3);
    assert.equal(resolveMyReviewPendingCount(['seo:job:read'], 2, 1), 0);
  });
});
