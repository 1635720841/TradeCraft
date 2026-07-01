/**
 * Semrush 中止协调器单元测试（Redis key / 错误类型）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadDist } from './load-dist.mjs';

const constants = loadDist(
  'project-types/seo-factory/providers/semrush/semrush-work-abort.constants.js',
);
const util = loadDist('project-types/seo-factory/providers/semrush/semrush-work-abort.util.js');

describe('semrush work abort', () => {
  it('semrushAbortRedisKey is namespaced by article job id', () => {
    assert.equal(constants.semrushAbortRedisKey('job-1'), 'semrush:abort:job-1');
  });

  it('SEMRUSH_ABORT_REDIS_CHANNEL is stable', () => {
    assert.equal(constants.SEMRUSH_ABORT_REDIS_CHANNEL, 'seo-factory:semrush-abort');
  });

  it('SemrushAbortSignalError converts to semrushAborted BusinessException', () => {
    const converted = util.toSemrushAbortedIfNeeded(new util.SemrushAbortSignalError(), 'fallback');
    assert.ok(converted);
    assert.equal(converted?.context?.semrushAborted, true);
    assert.equal(util.isSemrushAbortSignalError(new util.SemrushAbortSignalError()), true);
  });
});
