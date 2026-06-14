import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('playwright-queue.config', () => {
  it('defaults to enabled with concurrency 1', async () => {
    const prev = { ...process.env };
    delete process.env.PLAYWRIGHT_QUEUE_ENABLED;
    delete process.env.PLAYWRIGHT_QUEUE_CONCURRENCY;

    const mod = await import('../dist/core/queue/playwright-queue.config.js');
    assert.equal(mod.isPlaywrightQueueEnabled(), true);
    const opts = mod.readPlaywrightQueueOptions();
    assert.equal(opts.concurrency, 1);
    assert.equal(opts.limiter.max, 1);
    assert.equal(opts.limiter.duration, 60_000);

    process.env.PLAYWRIGHT_QUEUE_ENABLED = 'false';
    assert.equal(mod.isPlaywrightQueueEnabled(), false);

    Object.assign(process.env, prev);
  });
});
