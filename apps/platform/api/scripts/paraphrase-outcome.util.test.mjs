/**
 * 润色结果归类单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/paraphrase/paraphrase-outcome.util.js'),
).href;

const { isPolishUnneededOutcome } = await import(utilPath);

describe('isPolishUnneededOutcome', () => {
  it('returns true when all chunks were skipped without issues', () => {
    assert.equal(
      isPolishUnneededOutcome({
        contentUnchanged: true,
        chunksPolished: 0,
        safetyIssueCount: 0,
        validationPassed: true,
        warnings: [
          'validate_skipped:minimal_change',
          '[chunk-1] chunk_skipped:no_ai_cliches',
        ],
      }),
      true,
    );
  });

  it('returns false when validation failed', () => {
    assert.equal(
      isPolishUnneededOutcome({
        contentUnchanged: true,
        chunksPolished: 0,
        safetyIssueCount: 0,
        validationPassed: false,
        warnings: ['[chunk-0] 篇幅变化过大（200%）'],
      }),
      false,
    );
  });
});
