/**
 * SEO 问题项计数与展示文案（诊断 Tab 总览用）。
 */

import type { ArticleJobSeoCheckData } from "@/api/seo-factory/types";
import { getLocalMetrics, isSeoReleaseReady } from "@wm/shared-core";

export { isSeoReleaseReady };

export function countSeoIssueItems(seoCheckData?: ArticleJobSeoCheckData | null): number {
  const m = getLocalMetrics(seoCheckData);
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

export function buildSeoVerdictTitle(input: {
  localScore: number | null;
  semrushScore: number | null;
  localPassed: boolean;
  semrushPassed: boolean;
  /** 详情页可能传入校准后的展示分 */
  displayLocalScore?: number | null;
}): string {
  const local = input.displayLocalScore ?? input.localScore;
  const semrush = input.semrushScore;
  const releaseReady = isSeoReleaseReady(input.localPassed, input.semrushPassed);

  if (releaseReady) {
    const parts: string[] = ["可发布"];
    if (local != null) parts.push(`本地 ${local}/100`);
    if (semrush != null) parts.push(`Semrush ${semrush}/10`);
    return parts.join(" · ");
  }

  const parts: string[] = [];
  if (local != null) {
    parts.push(`本地 ${local}/100${input.localPassed ? " 达标" : " 待提升"}`);
  }
  if (semrush != null) {
    parts.push(`Semrush ${semrush}/10${input.semrushPassed ? " 达标" : " 待提升"}`);
  }
  return parts.length ? parts.join(" · ") : "暂无评分，请先生成正文";
}

export function buildSeoVerdictDesc(input: {
  releaseReady: boolean;
  issueCount: number;
  suggestionCount: number;
  hasDraftContent: boolean;
}): string {
  const { releaseReady, issueCount, suggestionCount, hasDraftContent } = input;
  const suggestTail = suggestionCount > 0 ? ` · ${suggestionCount} 条优化建议` : "";

  if (releaseReady) {
    if (issueCount > 0) {
      return `另有 ${issueCount} 处可读性细节可精修（不影响发布）${suggestTail}`;
    }
    if (suggestionCount > 0) {
      return `${suggestionCount} 条优化建议，可按需微调`;
    }
    return "可导出或发布";
  }

  if (issueCount > 0) {
    return `${issueCount} 项待修复${suggestTail}，修好后再发布`;
  }
  if (suggestionCount > 0) {
    return `${suggestionCount} 条优化建议，可按需微调`;
  }
  if (hasDraftContent) {
    return "暂无阻塞项，可继续优化或进入发布检查";
  }
  return "正文生成后可查看完整诊断";
}

export function fixesNavLabel(releaseReady: boolean): string {
  return releaseReady ? "可读性细节" : "待修复";
}

export function fixesSectionTitle(releaseReady: boolean): string {
  return releaseReady ? "可读性细节与建议" : "待修复与建议";
}

export function fixesSectionHint(releaseReady: boolean, count: number): string | null {
  if (count <= 0) return null;
  return releaseReady ? `${count} 处可精修` : `${count} 项待处理`;
}

export function issuesTabLabel(releaseReady: boolean, count: number): string {
  const base = releaseReady ? "可读性细节" : "问题定位";
  return count > 0 ? `${base} (${count})` : base;
}

export function emptyIssuesHint(releaseReady: boolean): string {
  return releaseReady ? "暂无额外精修项" : "暂无待修复项";
}

export function fixesEmptyDescription(releaseReady: boolean): string {
  return releaseReady ? "正文生成后可查看可读性细节" : "正文生成后可查看待修复项";
}

export function buildOutcomeSummaryDesc(input: {
  releaseReady: boolean;
  issueCount: number;
  hasDraftContent: boolean;
}): string {
  const { releaseReady, issueCount, hasDraftContent } = input;

  if (releaseReady) {
    if (issueCount > 0) {
      return `已达到发布标准；另有 ${issueCount} 处可读性细节可精修，不影响发布。`;
    }
    return "已完成竞品对标、SEO 评分、内容优化和发布物生成，适合直接交付给运营或推送到 CMS。";
  }

  if (issueCount > 0) {
    return `当前还有 ${issueCount} 项待修复，建议先处理诊断里的结构、可读性和关键词覆盖问题。`;
  }
  if (hasDraftContent) {
    return "正文、标题和摘要已生成，可继续查看诊断、微调稿件或准备导出。";
  }
  return "任务还未产出正文，完成后这里会汇总分数、资产和发布状态。";
}
