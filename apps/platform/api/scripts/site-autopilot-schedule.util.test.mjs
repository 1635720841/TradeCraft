/**
 * site-autopilot-schedule.util 单元测试。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/constants/site-autopilot-schedule.util.js'),
).href;
const {
  applyAutopilotSchedulePreset,
  beijingHourToUtcHour,
  describeAutopilotSchedule,
  inferAutopilotSchedulePreset,
  utcHourToBeijingHour,
} = await import(utilPath);

describe('site-autopilot-schedule.util', () => {
  it('converts Beijing hour to UTC hour', () => {
    assert.equal(beijingHourToUtcHour(9), 1);
    assert.equal(utcHourToBeijingHour(1), 9);
  });

  it('infers daily preset', () => {
    assert.equal(
      inferAutopilotSchedulePreset([0, 1, 2, 3, 4, 5, 6], 1),
      'daily_1',
    );
    assert.equal(inferAutopilotSchedulePreset([1, 3, 5], 1), 'weekly_3');
    assert.equal(inferAutopilotSchedulePreset([2, 4], 2), 'custom');
  });

  it('applyAutopilotSchedulePreset maps preset to schedule', () => {
    const applied = applyAutopilotSchedulePreset('daily_2');
    assert.deepEqual(applied.runDaysOfWeek, [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(applied.articlesPerRun, 2);
  });

  it('describeAutopilotSchedule renders daily summary', () => {
    const text = describeAutopilotSchedule({
      runDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      articlesPerRun: 1,
      runHourUtc: 1,
    });
    assert.match(text, /每天 09:00（北京时间）自动入队 1 篇/);
  });
});
