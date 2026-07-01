import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveSemrushScore,
  pickSemrushOverallScore,
  tryReadSemrushScoreFromCaptured,
} from '../dist/project-types/seo-factory/providers/semrush/semrush-rpa-score.util.js';

describe('semrush-rpa-score.util', () => {
  it('resolveSemrushScore accepts 0.1-10', () => {
    assert.equal(resolveSemrushScore(8.5), 8.5);
    assert.equal(resolveSemrushScore(0), null);
    assert.equal(resolveSemrushScore(42), null);
  });

  it('pickSemrushOverallScore prefers DOM', () => {
    assert.equal(pickSemrushOverallScore(7.2, 10, 'test'), 7.2);
    assert.equal(pickSemrushOverallScore(null, 8.1, 'test'), 8.1);
  });

  it('tryReadSemrushScoreFromCaptured returns null for empty', () => {
    assert.equal(tryReadSemrushScoreFromCaptured([]), null);
  });
});
