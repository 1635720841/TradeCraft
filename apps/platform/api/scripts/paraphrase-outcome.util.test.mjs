/**
 * 润色结果归类单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadDist } from './load-dist.mjs';

const { isPolishUnneededOutcome } = loadDist(
  'project-types/seo-factory/modules/paraphrase/paraphrase-outcome.util.js',
);

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

  it('returns false when partial chunk warning is present', () => {
    assert.equal(
      isPolishUnneededOutcome({
        contentUnchanged: true,
        chunksPolished: 1,
        safetyIssueCount: 0,
        validationPassed: true,
        warnings: ['paraphrase_partial:low_llm_success_rate (0/1)'],
      }),
      false,
    );
  });
});
