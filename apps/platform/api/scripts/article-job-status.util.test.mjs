import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isCancellableJobStatus,
  isBusyJobStatus,
  JOB_STATUS_CANCELLED,
} from '../dist/project-types/seo-factory/constants/article-job-status.js';

describe('article-job-status', () => {
  it('isCancellableJobStatus includes QUEUED and PAUSED', () => {
    assert.equal(isCancellableJobStatus('QUEUED'), true);
    assert.equal(isCancellableJobStatus('PAUSED'), true);
    assert.equal(isCancellableJobStatus('COMPLETED'), false);
    assert.equal(isCancellableJobStatus('FAILED'), false);
    assert.equal(isCancellableJobStatus('CANCELLED'), false);
  });

  it('isBusyJobStatus excludes PAUSED and CANCELLED', () => {
    assert.equal(isBusyJobStatus('OPTIMIZING'), true);
    assert.equal(isBusyJobStatus('PAUSED'), false);
    assert.equal(isBusyJobStatus(JOB_STATUS_CANCELLED), false);
  });
});
