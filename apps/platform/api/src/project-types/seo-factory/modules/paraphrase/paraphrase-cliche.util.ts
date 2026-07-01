/**
 * 检测/替换正文中的典型 AI 套话，供 M7 保守润色使用。
 */

const ANTI_AI_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bdelve into\b/gi, replacement: 'explore' },
  { pattern: /\bin today's (?:digital )?landscape\b/gi, replacement: 'in this field' },
  { pattern: /\bit's important to note that\b/gi, replacement: '' },
  { pattern: /\bin conclusion\b[:,]?\s*/gi, replacement: '' },
  { pattern: /\bfurthermore\b[:,]?\s*/gi, replacement: '' },
  { pattern: /\brobust solution\b/gi, replacement: 'reliable solution' },
  { pattern: /\bcomprehensive guide\b/gi, replacement: 'guide' },
  { pattern: /综上所述[，,]?\s*/g, replacement: '' },
  { pattern: /值得注意的是[，,]?\s*/g, replacement: '' },
  { pattern: /在当今时代[，,]?\s*/g, replacement: '' },
  { pattern: /不可或缺/g, replacement: '重要' },
  { pattern: /深入了解/g, replacement: '了解' },
];

export function chunkHasAntiAiPhrases(content: string): boolean {
  return ANTI_AI_REPLACEMENTS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}

/** 确定性替换 AI 套话，不改结构 */
export function applyDeterministicAntiAiPolish(content: string): {
  content: string;
  changed: boolean;
} {
  let result = content;
  let changed = false;

  for (const { pattern, replacement } of ANTI_AI_REPLACEMENTS) {
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
      changed = true;
    }
  }

  if (!changed) {
    return { content, changed: false };
  }

  return {
    content: result
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/  +/g, ' ')
      .trim(),
    changed: true,
  };
}
