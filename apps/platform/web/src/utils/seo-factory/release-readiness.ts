/**
 * 任务发布就绪判定（封装 shared-core + 本地分展示来源）。
 */
import type { ArticleJobItem } from "@/api/seo-factory/types";
import {
  LOCAL_SEO_PASS_THRESHOLD,
  SEMRUSH_PASS_THRESHOLD
} from "@/constants/seo-factory";
import {
  buildReleaseReadinessLabel,
  evaluateReleaseReadiness,
  isSeoReleaseReady,
  type ReleaseReadinessResult
} from "@wm/shared-core";
import { resolveEffectiveLocalSeoScore } from "./local-seo-display";

export { isSeoReleaseReady };

export function resolveJobReleaseReadiness(
  job: ArticleJobItem | null | undefined
): ReleaseReadinessResult & { label: string } {
  const localPassThreshold =
    job?.siteWorkflow?.localPassThreshold ??
    job?.seoCheckData?.scoreThresholds?.localPassThreshold ??
    LOCAL_SEO_PASS_THRESHOLD;
  const semrushPassThreshold =
    job?.siteWorkflow?.semrushPassThreshold ??
    job?.seoCheckData?.scoreThresholds?.semrushPassThreshold ??
    SEMRUSH_PASS_THRESHOLD;

  const result = evaluateReleaseReadiness({
    localScore: job ? resolveEffectiveLocalSeoScore(job) : null,
    semrushScore: job?.semrushScore ?? null,
    localPassThreshold,
    semrushPassThreshold
  });

  return {
    ...result,
    label: buildReleaseReadinessLabel(result)
  };
}

export function isJobReleaseReady(job: ArticleJobItem | null | undefined): boolean {
  return resolveJobReleaseReadiness(job).releaseReady;
}
