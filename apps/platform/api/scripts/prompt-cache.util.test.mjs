/**
 * Prompt Redis 缓存 key 单元测试。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const utilPath = pathToFileURL(
  resolve(apiRoot, 'dist/modules/prompt/prompt-cache.util.js'),
).href;
const { buildPromptCacheKey, PROMPT_CACHE_TTL_SECONDS } = await import(utilPath);

describe('buildPromptCacheKey', () => {
  it('prefixes version with prompt:template:', () => {
    assert.equal(buildPromptCacheKey('seo_brief_v1'), 'prompt:template:seo_brief_v1');
  });
});

describe('PROMPT_CACHE_TTL_SECONDS', () => {
  it('is one hour', () => {
    assert.equal(PROMPT_CACHE_TTL_SECONDS, 3600);
  });
});
