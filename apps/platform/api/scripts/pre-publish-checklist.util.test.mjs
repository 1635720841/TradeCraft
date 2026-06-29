/**
 * pre-publish-checklist 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const sharedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core');
const utilPath = pathToFileURL(resolve(sharedRoot, 'dist/seo/pre-publish-checklist.js')).href;
const { buildPrePublishChecklistItems, prePublishChecklistAllDone } = await import(utilPath);

describe('pre-publish-checklist', () => {
  const base = {
    status: 'COMPLETED',
    hasStaleness: false,
    title: 'Industrial Valve Guide for B2B Buyers',
    metaDescription: 'a'.repeat(120),
    content: 'Contact us for a quote at example.com/contact',
    internalLinksApplied: true,
    internalLinkCount: 2,
    imagesApplied: true,
    outputUrl: 'https://cdn.example.com/out.zip',
    exportStale: false,
    ymylNeedsReview: false,
    ctaRequired: true,
    ctaPresent: true,
    cmsConfigured: true,
    cmsUiEnabled: true,
    cmsPublished: false,
    canPublishCms: true,
    cmsBlocked: false,
  };

  it('returns checklist items for completed job', () => {
    const items = buildPrePublishChecklistItems(base);
    assert.ok(items.length >= 7);
    assert.equal(items.find((item) => item.id === 'title')?.done, true);
    assert.equal(items.find((item) => item.id === 'internal_links')?.done, true);
  });

  it('includes seo_ready item', () => {
    const items = buildPrePublishChecklistItems({
      ...base,
      seoReleaseReady: false,
      seoReadyHint: '本地还差 5 分',
    });
    const seo = items.find((item) => item.id === 'seo_ready');
    assert.equal(seo?.done, false);
    assert.equal(seo?.action, 'go_seo');
  });

  it('disables cms when seo not ready', () => {
    const items = buildPrePublishChecklistItems({
      ...base,
      seoReleaseReady: false,
    });
    const cms = items.find((item) => item.id === 'cms_ready');
    assert.equal(cms?.disabled, true);
  });

  it('flags long title as incomplete', () => {
    const items = buildPrePublishChecklistItems({
      ...base,
      title: 'a'.repeat(61),
    });
    assert.equal(items.find((item) => item.id === 'title')?.done, false);
  });

  it('prePublishChecklistAllDone when all done', () => {
    const items = buildPrePublishChecklistItems({
      ...base,
      cmsPublished: true,
      seoReleaseReady: true,
    });
    assert.equal(prePublishChecklistAllDone(items), true);
  });

  it('returns empty when job not completed', () => {
    assert.deepEqual(
      buildPrePublishChecklistItems({ ...base, status: 'DRAFTING' }),
      [],
    );
  });
});
