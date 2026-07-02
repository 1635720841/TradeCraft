/**
 * ArticleJob.seoCheckData 共享类型（API/Web 统一引用）。
 */

export interface ArticleJobSeoCheckData {
  _v?: number;
  workflowProgress?: Record<string, unknown> | null;
  workflow?: Record<string, unknown>;
  local?: Record<string, unknown>;
  semrush?: Record<string, unknown>;
  quillbot?: Record<string, unknown>;
  ymylReview?: Record<string, unknown>;
  cmsPublish?: Record<string, unknown>;
  scoreThresholds?: Record<string, unknown>;
  optimizeHistory?: unknown[];
  optimizationRerun?: Record<string, unknown>;
  [key: string]: unknown;
}

/** @deprecated 使用 ArticleJobSeoCheckData */
export type ArticleJobSeoCheckDataV1 = ArticleJobSeoCheckData;
