/**
 * BFL 官方 API 轮询解析单元测试。
 * 用法：cd apps/platform/api && pnpm test:bfl
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pollPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/providers/bfl/bfl-poll.util.js'),
).href;
const {
  extractPollingUrl,
  extractReadyImageUrl,
  isTerminalFailureStatus,
} = await import(pollPath);

describe('extractPollingUrl', () => {
  it('returns polling_url from create response', () => {
    assert.equal(
      extractPollingUrl({ polling_url: 'https://api.bfl.ai/v1/get_result?id=abc' }),
      'https://api.bfl.ai/v1/get_result?id=abc',
    );
  });
});

describe('extractReadyImageUrl', () => {
  it('returns sample url when status is Ready', () => {
    assert.equal(
      extractReadyImageUrl({
        status: 'Ready',
        result: { sample: 'https://cdn.bfl.ai/output.png' },
      }),
      'https://cdn.bfl.ai/output.png',
    );
  });

  it('returns undefined for pending status', () => {
    assert.equal(extractReadyImageUrl({ status: 'Pending' }), undefined);
  });
});

describe('isTerminalFailureStatus', () => {
  it('detects moderation and error statuses', () => {
    assert.equal(isTerminalFailureStatus('Failed'), true);
    assert.equal(isTerminalFailureStatus('Content Moderated'), true);
    assert.equal(isTerminalFailureStatus('Pending'), false);
  });
});
