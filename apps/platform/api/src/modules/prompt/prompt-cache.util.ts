/**
 * Prompt 模板 Redis 缓存 key 构建。
 */

const PROMPT_CACHE_PREFIX = 'prompt:template:';

export const PROMPT_CACHE_TTL_SECONDS = 3600;

export function buildPromptCacheKey(version: string): string {
  return `${PROMPT_CACHE_PREFIX}${version}`;
}
