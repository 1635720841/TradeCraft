/**
 * site-autopilot-settings 单元测试：解析、合并与到期判断。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/site-autopilot-settings.js'),
).href;
const {
  isAutopilotDueNow,
  mergeSiteAutopilotSettings,
  parseSiteAutopilotSettings,
  resolveSiteAutopilotSettings,
} = await import(utilPath);

describe('site-autopilot-settings', () => {
  it('parseSiteAutopilotSettings applies defaults and clamps values', () => {
    const parsed = parseSiteAutopilotSettings({
      enabled: true,
      articlesPerRun: 99,
      keywordSource: 'invalid',
      publishMode: 'draft',
      runDaysOfWeek: [9, 1, 1],
      runHourUtc: 30,
    });

    assert.equal(parsed?.enabled, true);
    assert.equal(parsed?.articlesPerRun, 10);
    assert.equal(parsed?.keywordSource, 'priority_pool');
    assert.equal(parsed?.publishMode, 'draft');
    assert.deepEqual(parsed?.runDaysOfWeek, [1, 6]);
    assert.equal(parsed?.runHourUtc, 23);
  });

  it('resolveSiteAutopilotSettings returns disabled defaults when missing', () => {
    const resolved = resolveSiteAutopilotSettings({});
    assert.equal(resolved.enabled, false);
    assert.equal(resolved.articlesPerRun, 1);
    assert.equal(resolved.publishMode, 'none');
    assert.deepEqual(resolved.runDaysOfWeek, [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(resolved.runHourUtc, 1);
  });

  it('mergeSiteAutopilotSettings patches enabled and publish mode', () => {
    const merged = mergeSiteAutopilotSettings(
      { enabled: false, articlesPerRun: 2, publishMode: 'none' },
      { enabled: true, publishMode: 'draft' },
    );
    assert.equal(merged?.enabled, true);
    assert.equal(merged?.articlesPerRun, 2);
    assert.equal(merged?.publishMode, 'draft');
  });

  it('mergeSiteAutopilotSettings preserves lastRun from existing', () => {
    const merged = mergeSiteAutopilotSettings(
      {
        enabled: true,
        lastRun: {
          at: '2026-07-01T01:00:00.000Z',
          status: 'enqueued',
          jobsEnqueued: 2,
        },
      },
      { articlesPerRun: 3 },
    );
    assert.equal(merged?.articlesPerRun, 3);
    assert.equal(merged?.lastRun?.status, 'enqueued');
    assert.equal(merged?.lastRun?.jobsEnqueued, 2);
  });

  it('parseSiteAutopilotSettings reads lastRun snapshot', () => {
    const parsed = parseSiteAutopilotSettings({
      enabled: true,
      lastRun: {
        at: '2026-07-01T01:00:00.000Z',
        status: 'failed',
        reason: 'quota exceeded',
      },
    });
    assert.equal(parsed?.lastRun?.status, 'failed');
    assert.equal(parsed?.lastRun?.reason, 'quota exceeded');
  });

  it('isAutopilotDueNow matches UTC day and hour', () => {
    const settings = {
      autopilot: {
        enabled: true,
        runDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        runHourUtc: 1,
      },
    };
    assert.equal(
      isAutopilotDueNow(settings, new Date('2026-07-06T01:15:00.000Z')),
      true,
    );
    assert.equal(
      isAutopilotDueNow(settings, new Date('2026-07-06T02:00:00.000Z')),
      false,
    );
  });
});
