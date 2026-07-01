/**
 * 润色相似度单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-similarity.util.js'),
).href;

const { isNearlyIdenticalParaphrase, measureParaphraseChangeRatio } = await import(utilPath);

describe('paraphrase-similarity.util', () => {
  it('returns 0 for identical content', () => {
    const text = 'UAV BMS design affects flight time and battery safety.';
    assert.equal(measureParaphraseChangeRatio(text, text), 0);
    assert.equal(isNearlyIdenticalParaphrase(text, text), true);
  });

  it('treats tiny synonym edits as nearly identical', () => {
    const original = [
      '## Verify SOC',
      '',
      'Connect these requirements to your flight profile and payload plan.',
      'Review cell balancing before each mission.',
    ].join('\n');
    const revised = [
      '## Verify SOC',
      '',
      'Tie these requirements to your flight profile and payload plan.',
      'Review cell balancing before each mission.',
    ].join('\n');
    assert.equal(isNearlyIdenticalParaphrase(original, revised, undefined, 0.12), true);
  });
});
