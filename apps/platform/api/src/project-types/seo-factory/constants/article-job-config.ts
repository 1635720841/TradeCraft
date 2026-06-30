/**
 * 文章任务运行时配置（存于 ArticleJob.seoCheckData.jobConfig，避免改表）。
 */

export interface ArticleJobConfig {
  /** 本篇 SERP 优化市场（Serper gl） */
  serpCountry?: string;
}

export function getArticleJobConfig(seoCheckData: unknown): ArticleJobConfig {
  const data = seoCheckData as { jobConfig?: ArticleJobConfig } | null;
  return data?.jobConfig ?? {};
}

export function withArticleJobConfig(
  seoCheckData: unknown,
  patch: ArticleJobConfig,
): Record<string, unknown> {
  const base = { ...((seoCheckData ?? {}) as Record<string, unknown>) };
  const prev = (base.jobConfig ?? {}) as ArticleJobConfig;
  const next: ArticleJobConfig = { ...prev, ...patch };
  if (!next.serpCountry?.trim()) {
    delete next.serpCountry;
  }
  if (Object.keys(next).length === 0) {
    delete base.jobConfig;
  } else {
    base.jobConfig = next;
  }
  return base;
}

export function buildArticleJobScraperOptions(
  config: ArticleJobConfig,
): { serpCountry?: string } | undefined {
  const serpCountry = config.serpCountry?.trim();
  return serpCountry ? { serpCountry } : undefined;
}
