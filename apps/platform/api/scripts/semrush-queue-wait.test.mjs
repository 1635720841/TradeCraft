/**
 * Playwright 队列 grace 等待工具单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/utils/semrush-queue-wait.util.js'),
).href;

const { isPlaywrightJobWaitTimeout } = await import(modPath);

describe('isPlaywrightJobWaitTimeout', () => {
  it('detects BullMQ waitUntilFinished timeout message', () => {
    assert.equal(
      isPlaywrightJobWaitTimeout(
        new Error(
          'Job wait semrush-check timed out before finishing, no finish notification arrived after 360000ms (id=133)',
        ),
      ),
      true,
    );
  });

  it('returns false for other errors', () => {
    assert.equal(isPlaywrightJobWaitTimeout(new Error('等待 Semrush 评分超时')), false);
  });
});
