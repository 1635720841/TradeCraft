/**
 * 任务详情成果摘要：从 ArticleJobItem 派生运营向展示数据。
 */

import type { ArticleJobItem } from "@/api/seo-factory/types";
import { LOCAL_SEO_PASS_THRESHOLD, SEMRUSH_PASS_THRESHOLD } from "@/constants/seo-factory";
import { summarizeCompetitorSerp } from "@wm/shared-core";
import { countDraftWords } from "./draft-edit-preview";
import { resolveEffectiveLocalSeoScore } from "./local-seo-display";
import { formatJobProgressHeadline } from "./job-progress";

export type DiagnoseSection = "seo" | "research" | "links" | "images" | "ymyl";

export interface JobDetailSummary {
  isInProgress: boolean;
  isCompleted: boolean;
  progressHeadline: string | null;
  wordCount: number | null;
  readMinutes: number | null;
  localScore: number | null;
  semrushScore: number | null;
  localPassThreshold: number;
  semrushPassThreshold: number;
  localPassed: boolean;
  semrushPassed: boolean;
  internalLinkCount: number | null;
  imageCount: number | null;
  competitorSampleCount: number;
  benchmarkLine: string | null;
  readinessBadges: string[];
  gscLine: string | null;
  hasDraftContent: boolean;
}

export function formatBenchmarkDelta(current: number, median: number): string | null {
  if (median <= 0 || current <= 0) return null;
  const pct = Math.round(((current - median) / median) * 100);
  if (Math.abs(pct) < 5) return `与竞品中位 ${median} 词接近`;
  if (pct > 0) return `较竞品中位多 ${pct}%（${current} vs ${median} 词）`;
  return `较竞品中位少 ${Math.abs(pct)}%（${current} vs ${median} 词）`;
}

export function buildJobDetailSummary(job: ArticleJobItem): JobDetailSummary {
  const content = job.draftData?.content ?? "";
  const hasDraftContent = Boolean(content.trim());
  const wordCount = hasDraftContent ? countDraftWords(content) : null;
  const readMinutes = wordCount != null && wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 250)) : null;

  const localPassThreshold =
    job.siteWorkflow?.localPassThreshold ??
    job.seoCheckData?.scoreThresholds?.localPassThreshold ??
    LOCAL_SEO_PASS_THRESHOLD;
  const semrushPassThreshold =
    job.siteWorkflow?.semrushPassThreshold ??
    job.seoCheckData?.scoreThresholds?.semrushPassThreshold ??
    SEMRUSH_PASS_THRESHOLD;

  const localScore = resolveEffectiveLocalSeoScore(job);
  const semrushScore = job.semrushScore ?? null;

  const competitor = summarizeCompetitorSerp(job.serpData?.organic ?? [], {
    targetWordCount: job.briefData?.outline?.targetWordCount,
    scrapeMeta: job.serpData?.competitorScrapeMeta
  });

  let benchmarkLine = competitor.wordCountHint;
  if (!benchmarkLine && wordCount != null && competitor.medianWordCount != null) {
    benchmarkLine = formatBenchmarkDelta(wordCount, competitor.medianWordCount);
  }
  if (!benchmarkLine && competitor.scrapedCount > 0) {
    benchmarkLine = `已对标 ${competitor.scrapedCount} 篇首页文章`;
  } else if (!benchmarkLine && competitor.total > 0) {
    benchmarkLine = `参考 ${competitor.total} 条搜索结果`;
  }

  const readinessBadges: string[] = [];
  if (competitor.scrapedCount > 0 || competitor.total > 0) {
    readinessBadges.push(`对标 ${competitor.scrapedCount || competitor.total} 篇样本`);
  }
  if (job.draftData?.paraphraseApplied) {
    readinessBadges.push("原创度优化");
  }
  if (job.status === "COMPLETED" && job.outputUrl) {
    readinessBadges.push("可发布");
  }
  if (job.seoCheckData?.ymylReview?.humanReviewStatus === "approved") {
    readinessBadges.push("内容审查通过");
  }

  const gsc = job.gscPerformance;
  const gscLine = gsc
    ? `搜索表现（近 ${gsc.periodDays} 天）：展示 ${gsc.impressions} · 点击 ${gsc.clicks} · 平均排名 ${gsc.position.toFixed(1)}`
    : null;

  const isCompleted = job.status === "COMPLETED";
  const isInProgress = job.status !== "COMPLETED" && job.status !== "FAILED";

  return {
    isInProgress,
    isCompleted,
    progressHeadline: formatJobProgressHeadline(job),
    wordCount,
    readMinutes,
    localScore,
    semrushScore,
    localPassThreshold,
    semrushPassThreshold,
    localPassed: localScore != null && localScore >= localPassThreshold,
    semrushPassed: semrushScore != null && semrushScore >= semrushPassThreshold,
    internalLinkCount: job.draftData?.internalLinksApplied
      ? (job.draftData.internalLinks?.length ?? 0)
      : null,
    imageCount: job.draftData?.imagesApplied
      ? (job.draftData.articleImages?.length ?? 0)
      : null,
    competitorSampleCount: competitor.scrapedCount || competitor.total,
    benchmarkLine,
    readinessBadges,
    gscLine,
    hasDraftContent
  };
}
