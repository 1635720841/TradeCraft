/**
 * 改写后程序化安全检查（链接/关键词保留）。
 *
 * 边界：
 * - 不负责：LLM 语义复检（ParaphraseService）
 */

export interface ParaphraseSafetyInput {
  keyword: string;
  originalContent: string;
  paraphrasedContent: string;
}

export interface ParaphraseSafetyResult {
  passed: boolean;
  issues: string[];
}

function extractMarkdownLinkUrls(content: string): string[] {
  const urls: string[] = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  let match = pattern.exec(content);
  while (match) {
    urls.push(match[1].trim());
    match = pattern.exec(content);
  }
  return urls;
}

function countKeywordOccurrences(content: string, keyword: string): number {
  if (!keyword.trim()) return 0;
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'gi');
  return (content.match(pattern) ?? []).length;
}

export function checkParaphraseSafety(input: ParaphraseSafetyInput): ParaphraseSafetyResult {
  const issues: string[] = [];
  const keyword = input.keyword.trim();
  const original = input.originalContent;
  const paraphrased = input.paraphrasedContent;

  if (!paraphrased.trim()) {
    return { passed: false, issues: ['改写结果为空'] };
  }

  const originalUrls = extractMarkdownLinkUrls(original);
  const paraphrasedUrls = new Set(extractMarkdownLinkUrls(paraphrased));

  for (const url of originalUrls) {
    if (!paraphrasedUrls.has(url)) {
      issues.push(`内链 URL 丢失：${url}`);
    }
  }

  if (keyword) {
    const originalCount = countKeywordOccurrences(original, keyword);
    const paraphrasedCount = countKeywordOccurrences(paraphrased, keyword);

    if (paraphrasedCount === 0) {
      issues.push('目标关键词在改写稿中完全缺失');
    } else if (originalCount > 0 && paraphrasedCount < Math.max(1, Math.floor(originalCount * 0.5))) {
      issues.push('目标关键词出现次数显著下降');
    }

    const head = paraphrased.slice(0, 200).toLowerCase();
    if (!head.includes(keyword.toLowerCase())) {
      issues.push('目标关键词未出现在正文前 200 字符内');
    }
  }

  const originalLen = original.split(/\s+/).filter(Boolean).length;
  const paraphrasedLen = paraphrased.split(/\s+/).filter(Boolean).length;
  if (originalLen > 0) {
    const ratio = paraphrasedLen / originalLen;
    if (ratio < 0.85 || ratio > 1.15) {
      issues.push(`篇幅变化过大（${Math.round(ratio * 100)}%）`);
    }
  }

  return { passed: issues.length === 0, issues };
}
