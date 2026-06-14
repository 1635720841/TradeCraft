import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('rate-limit.config', () => {
  it('buildOrgRateLimitKey uses fixed window bucket', async () => {
    const mod = await import('../dist/core/guards/rate-limit.config.js');
    const key = mod.buildOrgRateLimitKey('org-1', 60, 120_000);
    assert.equal(key, 'rate:org:org-1:2');
  });

  it('defaults to enabled with 120 req / 60s', async () => {
    const prev = { ...process.env };
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_ORG_MAX;
    delete process.env.RATE_LIMIT_ORG_WINDOW_SEC;

    const mod = await import('../dist/core/guards/rate-limit.config.js');
    assert.equal(mod.isRateLimitEnabled(), true);
    const opts = mod.readOrgRateLimitOptions();
    assert.equal(opts.maxRequests, 120);
    assert.equal(opts.windowSec, 60);

    process.env.RATE_LIMIT_ENABLED = 'false';
    assert.equal(mod.isRateLimitEnabled(), false);

    Object.assign(process.env, prev);
  });
});
