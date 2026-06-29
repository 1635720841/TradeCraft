/**
 * SEO 问题项计数与摘要（诊断 Tab 总览用）。
 */

import type { ArticleJobSeoCheckData } from "@/api/seo-factory/types";

export function countSeoIssueItems(seoCheckData?: ArticleJobSeoCheckData | null): number {
  const m = seoCheckData?.local?.metrics;
  if (!m) return 0;
  return (
    (m.longParagraphSamples?.length ?? 0) +
    (m.longSentenceSamples?.length ?? 0) +
    (m.hardToReadSentenceSamples?.length ?? 0) +
    (m.casualSentenceSamples?.length ?? 0) +
    (m.semrushComplexWordSamples?.length ?? 0)
  );
}

export function countSeoSuggestions(seoCheckData?: ArticleJobSeoCheckData | null): number {
  const local = seoCheckData?.local?.suggestions?.length ?? 0;
  const semrush = seoCheckData?.semrush?.suggestions?.length ?? 0;
  const details = seoCheckData?.semrush?.suggestionDetails;
  const detailCount = details
    ? (details.readability?.length ?? 0) +
      (details.seo?.length ?? 0) +
      (details.tone?.length ?? 0) +
      (details.originality?.length ?? 0)
    : 0;
  return Math.max(local + semrush, detailCount);
}
