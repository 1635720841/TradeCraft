/**
 * YMYL 检测单元测试。
 * 用法：cd apps/platform/api && pnpm test:ymyl
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/content-review/ymyl-detect.util.js'),
).href;
const { detectYmylContent, canPublishArticle } = await import(utilPath);

describe('detectYmylContent', () => {
  it('flags finance YMYL topics', () => {
    const result = detectYmylContent({
      targetKeyword: 'best mortgage rate for first home buyer',
      content: 'This article explains loan approval steps and credit score requirements.',
    });

    assert.equal(result.requires_human_review, true);
    assert.ok(result.categories.includes('finance'));
    assert.ok(result.matchedSignals.length > 0);
  });

  it('flags medical YMYL topics in Chinese', () => {
    const result = detectYmylContent({
      targetKeyword: '糖尿病饮食建议',
      content: '本文介绍糖尿病患者的用药与症状管理注意事项。',
    });

    assert.equal(result.requires_human_review, true);
    assert.ok(result.categories.includes('medical'));
  });

  it('does not flag generic industrial content', () => {
    const result = detectYmylContent({
      targetKeyword: 'industrial valve supplier',
      content: 'Our factory produces stainless steel valves for chemical plants.',
    });

    assert.equal(result.requires_human_review, false);
    assert.deepEqual(result.categories, []);
  });
});

describe('canPublishArticle', () => {
  it('blocks publish when requires_human_review is true', () => {
    assert.equal(
      canPublishArticle({ ymylReview: { requires_human_review: true } }),
      false,
    );
  });

  it('allows publish when review passed or absent', () => {
    assert.equal(
      canPublishArticle({ ymylReview: { requires_human_review: false } }),
      true,
    );
    assert.equal(canPublishArticle({}), true);
  });
});
