/**
 * 本地预检分展示：合并 job 字段、seoCheckData.local 与 workflowProgress 心跳分。
 *
 * 边界：
 * - 不负责：评分计算（后端 seo-checker）
 */

interface LocalSeoScoreSource {
  localSeoScore?: number | null;
  seoCheckData?: {
    local?: { score?: number };
    workflowProgress?: { localScore?: number };
  } | null;
}

/** 取各来源最高分，避免「状态条 100、面板仍 94」的展示不同步 */
export function resolveEffectiveLocalSeoScore(
  job: LocalSeoScoreSource | null | undefined,
): number | null {
  if (!job) return null;
  const candidates = [
    job.localSeoScore,
    job.seoCheckData?.local?.score,
    job.seoCheckData?.workflowProgress?.localScore,
  ].filter((v): v is number => typeof v === "number");
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}
