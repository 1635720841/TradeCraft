/**
 * Semrush SWA 语气侧栏对齐：检测 B2B 稿中「过于随意」的句子模式。
 *
 * 边界：
 * - 不负责：RPA 侧栏解析（semrush-near-miss.util）
 */

export interface CasualSentenceHit {
  text: string;
  reason: string;
}

const CASUAL_SENTENCE_RULES: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'imperative_opener', pattern: /\bnext,\s/i },
  { reason: 'rhetorical_question', pattern: /^(can|should) users\b/i },
  { reason: 'rfq_question', pattern: /^which\b.+\b(can|do|should|perform)\b/i },
  { reason: 'transitional_fragment', pattern: /\bcomes next\.?$/i },
  { reason: 'imperative_short', pattern: /^(do not|don't|avoid|limit|track|keep|stop)\s/i },
  { reason: 'colloquial_opener', pattern: /^(also|plus|so|well),\s/i },
  { reason: 'very_informal', pattern: /\b(show up|kind of|a lot of|lots of)\b/i },
];

function splitBodySentences(content: string): string[] {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#+\s+/gm, ' ')
    .replace(/^[-*]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences: string[] = [];
  const re = /([^.!?]+[.!?]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(plain)) !== null) {
    const sent = match[1].trim();
    if (sent.length >= 10) sentences.push(sent);
  }
  return sentences;
}

/** 与 Semrush「最为随意的句子」侧栏同类启发式 */
export function detectSemrushCasualSentences(content: string): CasualSentenceHit[] {
  const hits: CasualSentenceHit[] = [];
  const seen = new Set<string>();

  for (const sentence of splitBodySentences(content)) {
    for (const rule of CASUAL_SENTENCE_RULES) {
      if (!rule.pattern.test(sentence)) continue;
      const key = sentence.toLowerCase();
      if (seen.has(key)) break;
      seen.add(key);
      hits.push({ text: sentence.slice(0, 200), reason: rule.reason });
      break;
    }
  }

  return hits;
}

/** Semrush B2B 语气：随意句 ≤3 为优，>5 须改写 */
export const SEMRUSH_CASUAL_SENTENCE_SOFT_MAX = 3;
export const SEMRUSH_CASUAL_SENTENCE_HARD_MAX = 5;

const COLLOQUIAL_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bshow up\b/gi, replacement: 'appear' },
  { pattern: /\bkind of\b/gi, replacement: '' },
  { pattern: /\ba lot of\b/gi, replacement: 'many' },
  { pattern: /\blots of\b/gi, replacement: 'many' },
  { pattern: /\bBasically,\s*/gi, replacement: '' },
  { pattern: /\bJust\s+(?=[A-Za-z])/gi, replacement: '' },
  { pattern: /\bvery\s+(?=[A-Za-z])/gi, replacement: '' },
];

/** 常见被动 → 主动（轻量、仅高置信模式） */
const PASSIVE_LIGHT_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(is|are|was|were) enforced by the\b/gi, replacement: ' enforces' },
  { pattern: /\b(is|are|was|were) provided by the\b/gi, replacement: ' provides' },
  { pattern: /\b(is|are|was|were) supported by the\b/gi, replacement: ' supports' },
  { pattern: /\b(is|are|was|were) managed by the\b/gi, replacement: ' manages' },
  { pattern: /\bcan be achieved by\b/gi, replacement: 'achieves' },
];

/** 确定性语气/填充词修复（Semrush 手术式轮前置） */
export function applySemrushCasualToneFixes(content: string): string {
  let result = content;
  for (const { pattern, replacement } of COLLOQUIAL_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, ' ').replace(/ \./g, '.');
}

/** 确定性被动语态轻量修复（侧栏 quote 提取失败时的 fallback） */
export function applySemrushPassiveVoiceLightFixes(content: string): string {
  let result = content;
  for (const { pattern, replacement } of PASSIVE_LIGHT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
