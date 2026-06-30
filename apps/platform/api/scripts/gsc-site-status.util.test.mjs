/**
 * gsc-site-status.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/modules/gsc/gsc-site-status.util.js'),
).href;
const { buildSiteGscListSummary } = await import(utilPath);

describe('gsc-site-status.util', () => {
  it('returns not_enabled when plan has no GSC', () => {
    const summary = buildSiteGscListSummary(false, {
      propertyUrl: 'https://example.com/',
      managedByPlatform: true,
      lastSyncAt: new Date().toISOString(),
    });
    assert.equal(summary.status, 'not_enabled');
  });

  it('returns unbound when property is missing', () => {
    const summary = buildSiteGscListSummary(true, null);
    assert.equal(summary.status, 'unbound');
  });

  it('returns pending_sync when connected but never synced', () => {
    const summary = buildSiteGscListSummary(true, {
      propertyUrl: 'https://example.com/',
      managedByPlatform: true,
      lastSyncAt: null,
    });
    assert.equal(summary.status, 'pending_sync');
  });

  it('returns error when last sync failed', () => {
    const summary = buildSiteGscListSummary(true, {
      propertyUrl: 'https://example.com/',
      managedByPlatform: true,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: 'token expired',
    });
    assert.equal(summary.status, 'error');
    assert.equal(summary.lastSyncError, 'token expired');
  });

  it('returns synced for fresh connection', () => {
    const summary = buildSiteGscListSummary(true, {
      propertyUrl: 'https://example.com/',
      managedByPlatform: true,
      lastSyncAt: new Date().toISOString(),
    });
    assert.equal(summary.status, 'synced');
  });
});
