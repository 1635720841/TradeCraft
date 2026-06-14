/**
 * LLM JSON 响应清洗与解析：去除 Markdown 代码块包裹后安全解析。
 *
 * 边界：
 * - 不负责：业务字段校验（由调用方处理）
 */

export class LlmJsonParseError extends Error {
  constructor(
    message: string,
    public readonly rawSnippet: string,
  ) {
    super(message);
    this.name = 'LlmJsonParseError';
  }
}

/** 去除 LLM 返回中的 ```json 标记并 trim */
export function cleanLlmJson(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/** 清洗后 JSON.parse，失败时抛 LlmJsonParseError（附脱敏片段） */
export function parseLlmJson<T>(raw: string): T {
  const cleaned = cleanLlmJson(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const snippet = cleaned.slice(0, 200);
    throw new LlmJsonParseError('LLM 返回的 JSON 格式无效', snippet);
  }
}
