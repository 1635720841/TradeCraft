/**
 * LLM 分阶段模型解析单元测试。
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = pathToFileURL(
  resolve(apiRoot, 'dist/project-types/seo-factory/providers/llm/llm.config.js'),
).href;
const { resolveLlmModelForTask } = await import(configPath);

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe('resolveLlmModelForTask', () => {
  it('uses fallback when task has no override', () => {
    process.env.LLM_MODEL = 'gpt-5.4';
    assert.equal(resolveLlmModelForTask('default', 'gpt-5.4'), 'gpt-5.4');
    assert.equal(resolveLlmModelForTask('brief', 'gpt-5.4'), 'gpt-5.4');
  });

  it('uses task-specific override when set', () => {
    process.env.LLM_MODEL = 'gpt-5.4';
    process.env.LLM_MODEL_DRAFT = 'gpt-4.1';
    process.env.LLM_MODEL_OPTIMIZE = 'gpt-5.4';
    assert.equal(resolveLlmModelForTask('draft', 'preset-model'), 'gpt-4.1');
    assert.equal(resolveLlmModelForTask('optimize', 'preset-model'), 'gpt-5.4');
  });

  it('rewrite falls back to LLM_MODEL_OPTIMIZE then default', () => {
    process.env.LLM_MODEL = 'gpt-5.4';
    process.env.LLM_MODEL_OPTIMIZE = 'gemini-2.5-flash';
    assert.equal(resolveLlmModelForTask('rewrite', 'preset-model'), 'gemini-2.5-flash');
  });
});
