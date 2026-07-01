import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconcileOrgQueueActiveCount } from '../dist/core/queue/org-queue-limiter.util.js';

describe('reconcileOrgQueueActiveCount', () => {
  it('keeps redis count when not inflated', () => {
    assert.equal(reconcileOrgQueueActiveCount(1, 1), 1);
    assert.equal(reconcileOrgQueueActiveCount(0, 0), 0);
  });

  it('falls back to db held when redis is higher', () => {
    assert.equal(reconcileOrgQueueActiveCount(3, 1), 1);
    assert.equal(reconcileOrgQueueActiveCount(2, 0), 0);
  });
});
