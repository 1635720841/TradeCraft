/**
 * QuillBot 改写安全检查单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-safety.util.js'),
).href;
const { checkParaphraseSafety } = await import(utilPath);

describe('checkParaphraseSafety', () => {
  it('passes when links and keyword are preserved', () => {
    const original =
      '# industrial valve\n\nindustrial valve guide with [products](/products) details.';
    const paraphrased =
      '# industrial valve\n\nThis industrial valve guide covers [products](/products) clearly.';

    const result = checkParaphraseSafety({
      keyword: 'industrial valve',
      originalContent: original,
      paraphrasedContent: paraphrased,
    });

    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
  });

  it('fails when an internal link URL is removed', () => {
    const original = 'See [catalog](/catalog) for options.';
    const paraphrased = 'See our catalog for options.';

    const result = checkParaphraseSafety({
      keyword: 'catalog',
      originalContent: original,
      paraphrasedContent: paraphrased,
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((item) => item.includes('/catalog')));
  });

  it('fails when protected term is dropped', () => {
    const original = 'Our XYZ-2000 valve meets CE standards at 10 bar.';
    const paraphrased = 'Our valve meets standards at high pressure.';

    const result = checkParaphraseSafety({
      keyword: 'valve',
      originalContent: original,
      paraphrasedContent: paraphrased,
      protectedTerms: ['XYZ-2000', 'CE', '10 bar'],
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((item) => item.includes('保护词丢失')));
  });

  it('uses character-based length ratio for zh-CN', () => {
    const original = '工业阀门选型指南，介绍球阀与蝶阀的应用场景与采购要点。';
    const paraphrased = '工业阀门。';

    const result = checkParaphraseSafety({
      keyword: '工业阀门',
      originalContent: original,
      paraphrasedContent: paraphrased,
      contentLanguage: 'zh-CN',
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((item) => item.includes('篇幅变化过大')));
  });

  it('fails when image URL is removed', () => {
    const original = '![valve diagram](/images/valve.png)\n\nContent here.';
    const paraphrased = 'Content here without image.';

    const result = checkParaphraseSafety({
      keyword: 'valve',
      originalContent: original,
      paraphrasedContent: paraphrased,
    });

    assert.equal(result.passed, false);
    assert.ok(result.issues.some((item) => item.includes('/images/valve.png')));
  });

  it('skips keyword head check for non-lead chunks', () => {
    const original = '## Selection guide\n\nBall valve details for plants.';
    const paraphrased = '## Selection guide\n\nUpdated ball valve details for plants.';

    const result = checkParaphraseSafety({
      keyword: 'ball valve',
      originalContent: original,
      paraphrasedContent: paraphrased,
      skipKeywordHeadCheck: true,
    });

    assert.equal(result.passed, true);
  });
});
