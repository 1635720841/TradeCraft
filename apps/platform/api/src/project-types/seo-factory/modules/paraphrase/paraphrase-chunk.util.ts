/**
 * 按 H2 拆分正文，供分块原创表达优化。
 *
 * 边界：
 * - 不负责：LLM 调用（ParaphraseService）
 */

import {
  PARAPHRASE_CHUNK_MIN_CHARS,
  PARAPHRASE_CHUNK_MIN_H2,
} from '../../constants/paraphrase';

export interface ParaphraseContentChunk {
  id: string;
  content: string;
  /** 首段（含文首导语）须保留关键词开篇检查 */
  isLead: boolean;
}

export function countH2Headings(content: string): number {
  return (content.match(/^## /gm) ?? []).length;
}

export function shouldUseChunkedParaphrase(content: string): boolean {
  return content.length >= PARAPHRASE_CHUNK_MIN_CHARS && countH2Headings(content) >= PARAPHRASE_CHUNK_MIN_H2;
}

/** 按 H2 拆段：文首导语为 chunk-0，每个 ## 标题及其下属内容为独立段 */
export function splitContentByH2(content: string): ParaphraseContentChunk[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/(?=^## )/m).map((part) => part.trim()).filter(Boolean);
  return parts.map((part, index) => ({
    id: `chunk-${index}`,
    content: part,
    isLead: index === 0,
  }));
}

export function joinParaphraseChunks(chunks: Array<{ content: string }>): string {
  return chunks
    .map((chunk) => chunk.content.trim())
    .filter(Boolean)
    .join('\n\n');
}
