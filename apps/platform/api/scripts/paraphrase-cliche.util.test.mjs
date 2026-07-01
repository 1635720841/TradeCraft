/**
 * AI 套话检测与确定性替换单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-cliche.util.js'),
).href;

const { applyDeterministicAntiAiPolish, chunkHasAntiAiPhrases } = await import(utilPath);

describe('paraphrase-cliche.util', () => {
  it('detects common AI phrases', () => {
    assert.equal(chunkHasAntiAiPhrases('We will delve into BMS design.'), true);
    assert.equal(chunkHasAntiAiPhrases('Flight time depends on pack capacity.'), false);
  });

  it('replaces delve into without changing structure', () => {
    const original = '## Guide\n\nWe will delve into BMS design for UAV fleets.';
    const result = applyDeterministicAntiAiPolish(original);
    assert.equal(result.changed, true);
    assert.match(result.content, /explore BMS design/);
    assert.doesNotMatch(result.content, /delve into/);
    assert.match(result.content, /^## Guide/);
  });
});
