/**
 * Semrush SWA Overall 分数文本解析（侧栏「极佳 8.3/10」）。
 *
 * 边界：
 * - 不负责：recommendations API JSON（见 semrush-recommendations.parser）
 *
 * 入口：
 * - parseOverallScoreFromText
 */

function parseScoreValue(raw: string): number | null {
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 10) return null;
  return value;
}

/** 从 UI 文本解析 0–10 总分，优先带质量标签的总分行，避免误读子维度 10/10 */
export function parseOverallScoreFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ');

  const qualitySlash = normalized.match(
    /(?:极佳|优秀|良好|糟糕|中等|Needs improvement|Overall(?:\s+score)?|Score|整体|分数|文章质量得分)[^0-9]{0,24}(\d+(?:[.,]\d+)?)\s*\/\s*10/i,
  );
  if (qualitySlash) {
    const value = parseScoreValue(qualitySlash[1]);
    if (value !== null) return value;
  }

  const qualityHint = normalized.match(
    /(?:文章质量得分|质量得分)[：:]?\s*(\d+(?:[.,]\d+)?)\s*[（(]\s*共\s*10/i,
  );
  if (qualityHint) {
    const value = parseScoreValue(qualityHint[1]);
    if (value !== null) return value;
  }

  const slashAfter = normalized.match(
    /(\d+(?:[.,]\d+)?)\s*\/\s*10[^0-9]{0,16}(?:极佳|优秀|良好|糟糕|Overall|Score|整体|分数)/i,
  );
  if (slashAfter) {
    const value = parseScoreValue(slashAfter[1]);
    if (value !== null) return value;
  }

  const slashMatches = [...normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*\/\s*10/g)];
  for (const match of slashMatches) {
    const idx = match.index ?? 0;
    const window = normalized.slice(Math.max(0, idx - 48), idx);
    if (!/(极佳|优秀|良好|Overall|整体|分数|Score|质量)/i.test(window)) continue;
    const value = parseScoreValue(match[1]);
    if (value !== null) return value;
  }

  if (normalized.length <= 120) {
    for (const match of slashMatches) {
      const value = parseScoreValue(match[1]);
      if (value !== null) return value;
    }
  }

  const labeledOnly = normalized.match(
    /(?:极佳|优秀|良好|糟糕|Needs improvement|Overall|Score|整体|分数)[^0-9]{0,24}(\d+(?:[.,]\d+)?)(?!\s*\/)/i,
  );
  if (labeledOnly && normalized.length <= 80) {
    const value = parseScoreValue(labeledOnly[1]);
    if (value !== null) return value;
  }

  return null;
}
