/**
 * LLM 连接配置：从环境变量解析 OpenAI 兼容端点与模型。
 *
 * 边界：
 * - 不负责：发起 HTTP 请求（由 OpenAiCompatibleAdapter 处理）
 *
 * 入口：
 * - resolveLlmConfig
 */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerLabel: string;
  jsonMode: boolean;
}

/** LLM 任务类型，用于分阶段模型覆盖 */
export type LlmTask = 'brief' | 'draft' | 'optimize' | 'rewrite' | 'default';

export interface LlmSampling {
  temperature: number;
  seed?: number;
}

interface LlmPreset {
  baseUrl: string;
  model: string;
  label: string;
}

const LLM_PRESETS: Record<string, LlmPreset> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    label: 'DeepSeek',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    label: 'OpenAI',
  },
  packyapi: {
    baseUrl: 'https://www.packyapi.com/v1',
    model: 'gpt-4o-mini',
    label: 'PackyAPI',
  },
};

export function resolveLlmChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, '');
  return `${normalized}/chat/completions`;
}

export function resolveLlmConfig(task: LlmTask = 'default'): LlmConfig {
  const provider = process.env.PROVIDER_LLM?.trim().toLowerCase() || 'deepseek';
  const preset = LLM_PRESETS[provider] ?? LLM_PRESETS.deepseek;

  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('LLM_API_KEY 或 DEEPSEEK_API_KEY 未配置');
  }

  const baseUrl = (process.env.LLM_API_BASE_URL?.trim() || preset.baseUrl).replace(/\/$/, '');
  const defaultModel = process.env.LLM_MODEL?.trim() || preset.model;
  const model = resolveLlmModelForTask(task, defaultModel);
  const providerLabel = process.env.LLM_PROVIDER_LABEL?.trim() || preset.label;
  const jsonMode = process.env.LLM_JSON_MODE !== 'false';

  return { baseUrl, apiKey, model, providerLabel, jsonMode };
}

/**
 * 分阶段模型：未设置时回退 LLM_MODEL。
 * - LLM_MODEL_BRIEF / LLM_MODEL_DRAFT / LLM_MODEL_OPTIMIZE / LLM_MODEL_REWRITE
 */
export function resolveLlmModelForTask(task: LlmTask, fallback: string): string {
  const byTask: Partial<Record<LlmTask, string | undefined>> = {
    brief: process.env.LLM_MODEL_BRIEF?.trim(),
    draft: process.env.LLM_MODEL_DRAFT?.trim(),
    optimize: process.env.LLM_MODEL_OPTIMIZE?.trim(),
    rewrite:
      process.env.LLM_MODEL_REWRITE?.trim() || process.env.LLM_MODEL_OPTIMIZE?.trim(),
  };
  return byTask[task]?.trim() || fallback;
}

/** 优化任务用较低 temperature 以稳定输出；Brief/初稿仍用默认采样 */
export function resolveLlmSampling(task: 'optimize' | 'default' = 'default'): LlmSampling {
  const defaultTemp = Number(process.env.LLM_TEMPERATURE ?? 0.7);
  const optimizeTemp = Number(process.env.LLM_OPTIMIZE_TEMPERATURE ?? 0.2);
  const temperature = task === 'optimize' ? optimizeTemp : defaultTemp;
  const seedRaw = process.env.LLM_SEED?.trim();
  const seed = seedRaw ? Number(seedRaw) : undefined;

  return {
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    ...(Number.isFinite(seed) ? { seed } : {}),
  };
}
