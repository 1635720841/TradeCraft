/**
 * LLM JSON 响应清洗与解析：去除 Markdown / 思考块后安全解析。
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

const REASONING_BLOCK_PATTERNS: RegExp[] = [
  /<think[\s\S]*?<\/think>/gi,
  /<think>[\s\S]*?<\/redacted_thinking>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
];

/** 去除 LLM 返回中的思考/推理块 */
export function stripLlmReasoningBlocks(raw: string): string {
  let text = raw;
  for (const pattern of REASONING_BLOCK_PATTERNS) {
    text = text.replace(pattern, '');
  }
  return text.trim();
}

/** 去除 LLM 返回中的 ```json 标记并 trim */
export function cleanLlmJson(raw: string): string {
  return stripLlmReasoningBlocks(raw)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/** 从混合文本中提取首个完整 JSON 对象或数组 */
export function extractLlmJsonText(raw: string): string {
  const stripped = stripLlmReasoningBlocks(raw).trim();
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectStart = stripped.indexOf('{');
  const arrayStart = stripped.indexOf('[');
  let start = -1;
  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    start = objectStart;
  } else if (arrayStart >= 0) {
    start = arrayStart;
  }

  if (start < 0) {
    return cleanLlmJson(stripped);
  }

  const open = stripped[start];
  const close = open === '{' ? '}' : ']';
  const slice = sliceBalancedJson(stripped, start, open, close);
  return slice ?? cleanLlmJson(stripped);
}

function sliceBalancedJson(
  text: string,
  start: number,
  open: string,
  close: string,
): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/** 清洗后 JSON.parse，失败时抛 LlmJsonParseError（附脱敏片段） */
export function parseLlmJson<T>(raw: string): T {
  const candidates = [cleanLlmJson(raw), extractLlmJsonText(raw)];
  const unique = [...new Set(candidates.filter((item) => item.length > 0))];

  for (const cleaned of unique) {
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // try next candidate
    }
  }

  const snippet = unique[0]?.slice(0, 200) ?? raw.slice(0, 200);
  throw new LlmJsonParseError('LLM 返回的 JSON 格式无效', snippet);
}
