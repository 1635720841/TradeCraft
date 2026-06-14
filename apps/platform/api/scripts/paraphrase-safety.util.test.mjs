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
});
