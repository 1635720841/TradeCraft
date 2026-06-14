import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('scraper.config', () => {
  it('competitor scrape defaults to enabled with concurrency 2', async () => {
    const prev = { ...process.env };
    delete process.env.SCRAPER_COMPETITOR_ENABLED;
    delete process.env.SCRAPER_COMPETITOR_CONCURRENCY;

    const mod = await import('../dist/project-types/seo-factory/constants/scraper.config.js');
    assert.equal(mod.isCompetitorScrapeEnabled(), true);
    const opts = mod.readCompetitorScrapeOptions();
    assert.equal(opts.concurrency, 2);
    assert.equal(opts.timeoutMs, 15_000);

    process.env.SCRAPER_COMPETITOR_ENABLED = 'false';
    assert.equal(mod.isCompetitorScrapeEnabled(), false);

    Object.assign(process.env, prev);
  });
});

describe('semrush-browser.util', () => {
  it('defaults browser pool size to 1', async () => {
    const prev = process.env.SEMRUSH_BROWSER_POOL_SIZE;
    delete process.env.SEMRUSH_BROWSER_POOL_SIZE;
    const mod = await import('../dist/project-types/seo-factory/providers/semrush/semrush-browser.util.js');
    assert.equal(mod.readSemrushBrowserPoolSize(), 1);
    process.env.SEMRUSH_BROWSER_POOL_SIZE = prev;
  });
});
