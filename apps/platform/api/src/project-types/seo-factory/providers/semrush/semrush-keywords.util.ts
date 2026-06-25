/**
 * Semrush SWA 目标关键词清洗：过滤过泛单词，避免「输入具体的关键词」校验失败。
 *
 * 边界：
 * - 不负责：RPA 填表（SemrushRpaAdapter）
 *
 * 入口：
 * - isSemrushSpecificKeyword
 * - sanitizeSemrushKeywordGoal
 */

/** 单独出现时过泛，SWA 会标灰 */
const GENERIC_SINGLE_WORDS = new Set([
  'voltage',
  'current',
  'temperature',
  'batteries',
  'battery',
  'power',
  'energy',
  'system',
  'systems',
  'device',
  'devices',
  'data',
  'quality',
  'performance',
  'safety',
  'control',
  'monitoring',
  'sensor',
  'sensors',
  'module',
  'modules',
  'cell',
  'cells',
  'pack',
  'packs',
  'bluetooth',
  'rs485',
  'rs232',
  'wifi',
  'can',
  'bus',
  'usb',
  'type',
  'types',
  'model',
  'models',
  'lifepo4',
  'lithium',
]);

/** 非 SEO 检索意图的停用词 */
const STOP_WORDS = new Set([
  'explained',
  'explain',
  'guide',
  'overview',
  'article',
  'importance',
  'benefits',
  'features',
  'introduction',
  'conclusion',
  'summary',
  'comparison',
  'versus',
  'using',
  'used',
  'uses',
  'what',
  'how',
  'why',
  'when',
  'best',
  'top',
  'new',
  'free',
]);

/** 主目标词始终保留；推荐词须为具体短语（≥2 词或连字符复合词） */
export function isSemrushSpecificKeyword(term: string, isPrimary = false): boolean {
  const trimmed = term.trim();
  if (!trimmed) return false;
  if (isPrimary) return true;

  const lower = trimmed.toLowerCase();
  if (GENERIC_SINGLE_WORDS.has(lower) || STOP_WORDS.has(lower)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return true;

  if (trimmed.includes('-') && trimmed.length >= 8) return true;

  return false;
}

export function sanitizeSemrushKeywordGoal(
  primary: string,
  recommendedKeywords?: string[],
): { keywords: string[]; dropped: string[] } {
  const dropped: string[] = [];
  const keywords: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string, isPrimary: boolean) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    if (!isSemrushSpecificKeyword(trimmed, isPrimary)) {
      dropped.push(trimmed);
      return;
    }
    seen.add(key);
    keywords.push(trimmed);
  };

  for (const part of primary.split(/[,，]/)) {
    push(part, true);
  }
  for (const item of recommendedKeywords ?? []) {
    for (const part of item.split(/[,，]/)) {
      push(part, false);
    }
  }

  return { keywords: keywords.slice(0, 30), dropped };
}

/** 正文 n-gram 提取噪声，不应进入 LLM 推荐词列表 */
const WEAK_EXTRACTED_PREFIX_RE =
  /^(so it|pack so|it can|not only by|as can|it turns|how the bms|at the same|more for evaluation|view of pack|guide to you|you can also|life for b2b|bms can slow|no two cells|gap is why|common buyer questions|quick selection checklist|related references|varies depending|final takeaways|toggle the table|wikipedia the free|browning hi power|fn high power)\b/i;

export function isWeakExtractedPhrase(phrase: string): boolean {
  const normalized = phrase.trim().toLowerCase();
  if (!normalized) return true;
  if (WEAK_EXTRACTED_PREFIX_RE.test(normalized)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    if (words.includes('also') && words.includes('you')) return true;
    if (words[0] === 'no' && words.length === 3) return true;
    if (words.length === 3 && words[1] === 'can') return true;
    if (normalized.includes(' for b2b')) return true;
    if (words[0] === 'gap' && words[1] === 'is') return true;
  }
  if (normalized.includes('wikipedia')) return true;
  if (normalized.includes('table of contents')) return true;
  return false;
}

/** 供 seo-checker 合并推荐词时过滤（不含主关键词） */
export function filterSemrushRecommendedKeywords(
  terms: string[],
  targetKeyword: string,
): string[] {
  const main = targetKeyword.trim().toLowerCase();
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of terms) {
    for (const part of raw.split(/[,，]/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (key === main || seen.has(key)) continue;
      if (WEAK_EXTRACTED_PREFIX_RE.test(trimmed)) continue;
      if (!isSemrushSpecificKeyword(trimmed, false)) continue;
      seen.add(key);
      result.push(trimmed);
    }
  }

  return result.slice(0, 20);
}
