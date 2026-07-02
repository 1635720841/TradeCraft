/**
 * Port 注册表 happy path 单测。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function importDist(relativePath) {
  return import(pathToFileURL(resolve(apiRoot, relativePath)).href);
}

const emptyStats = {
  completedJobs: 0,
  activeJobs: 0,
  failedJobs: 0,
  pendingBriefCount: 0,
  pendingReviewCount: 0,
  pendingPublishCount: 0,
  staleDraftCount: 0,
  myAssignedCount: 0,
  myReviewPendingCount: 0,
};

describe('project-type port registries', () => {
  it('production-stats register + list', async () => {
    const {
      registerProductionStatsPort,
      getProductionStatsPort,
      listProductionStatsPorts,
    } = await importDist('dist/core/organization/production-stats.registry.js');

    registerProductionStatsPort({
      projectType: 'test-stats',
      supportsOrgDashboard: () => true,
      getProjectProductionStats: async () => emptyStats,
    });

    assert.equal(getProductionStatsPort('test-stats')?.projectType, 'test-stats');
    assert.ok(listProductionStatsPorts().some((port) => port.projectType === 'test-stats'));
  });

  it('billing-meter register + meters', async () => {
    const { registerBillingMeterPort, getBillingMeterPort } = await importDist(
      'dist/core/billing/billing-meter.registry.js',
    );

    registerBillingMeterPort({
      projectType: 'test-billing',
      meters: () => [{ id: 'article.completed', label: '完成文章' }],
      countInFlightUsage: async () => 0,
    });

    assert.deepEqual(getBillingMeterPort('test-billing')?.meters(), [
      { id: 'article.completed', label: '完成文章' },
    ]);
  });

  it('console-site-enrichment enrichSite', async () => {
    const { registerConsoleSiteEnrichmentPort, getConsoleSiteEnrichmentPort } = await importDist(
      'dist/core/console/console-site-enrichment.registry.js',
    );

    registerConsoleSiteEnrichmentPort({
      projectType: 'test-console',
      enrichSite: () => ({
        profileReady: true,
        gscEnabled: false,
        gsc: { status: 'not_enabled', lastSyncAt: null, lastSyncError: null },
      }),
    });

    const result = getConsoleSiteEnrichmentPort('test-console')?.enrichSite({
      settings: {},
      gscConnection: null,
      organizationPlanName: 'free',
    });
    assert.equal(result?.profileReady, true);
  });

  it('project-search searchInProjects', async () => {
    const { registerProjectSearchPort, getProjectSearchPort } = await importDist(
      'dist/core/search/project-search.registry.js',
    );

    registerProjectSearchPort({
      projectType: 'test-search',
      searchInProjects: async () => [
        { type: 'demo', label: '演示项', items: [{ id: '1', title: 't', path: '/x' }] },
      ],
    });

    const groups = await getProjectSearchPort('test-search')?.searchInProjects(
      { organizationId: 'org', userId: 'u' },
      'q',
      ['p1'],
      5,
    );
    assert.equal(groups?.[0]?.items.length, 1);
  });
});
