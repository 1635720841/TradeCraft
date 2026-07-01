/**
 * 润色前后正文相似度，用于决定是否调用 LLM 语义复检。
 */

import { normalizeContentLanguage } from '@wm/shared-core';

function tokenize(content: string, contentLanguage?: string): string[] {
  const lang = normalizeContentLanguage(contentLanguage);
  if (lang === 'zh-CN') {
    const tokens: string[] = [];
    const tokensCjk = content.match(/[\u4e00-\u9fff]/g) ?? [];
    tokens.push(...tokensCjk);
    tokens.push(...content.split(/\s+/).filter((item) => /[a-zA-Z0-9]/.test(item)));
    return tokens.map((item) => item.toLowerCase());
  }
  return content
    .split(/\s+/)
    .map((item) => item.toLowerCase().replace(/[^a-z0-9'-]/g, ''))
    .filter(Boolean);
}

/** 0 = 完全相同，1 = 完全不同 */
export function measureParaphraseChangeRatio(
  original: string,
  revised: string,
  contentLanguage?: string,
): number {
  const left = new Set(tokenize(original, contentLanguage));
  const right = new Set(tokenize(revised, contentLanguage));
  if (left.size === 0 && right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size;
  if (union === 0) return 0;
  return 1 - intersection / union;
}

export function isNearlyIdenticalParaphrase(
  original: string,
  revised: string,
  contentLanguage?: string,
  maxChangeRatio = 0.06,
): boolean {
  const normalizedOriginal = original.replace(/\s+/g, ' ').trim();
  const normalizedRevised = revised.replace(/\s+/g, ' ').trim();
  if (normalizedOriginal === normalizedRevised) return true;

  const tokenChange = measureParaphraseChangeRatio(original, revised, contentLanguage);
  if (tokenChange <= maxChangeRatio) return true;

  const originalLines = original
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const revisedLines = revised
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (originalLines.length === 0 || originalLines.length !== revisedLines.length) {
    return false;
  }

  let sameLines = 0;
  for (let index = 0; index < originalLines.length; index += 1) {
    if (originalLines[index] === revisedLines[index]) sameLines += 1;
  }
  return sameLines / originalLines.length >= 0.94 && tokenChange <= 0.15;
}
