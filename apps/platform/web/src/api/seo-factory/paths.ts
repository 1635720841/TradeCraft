/**
 * SEO 工厂 API 路径（新前缀 PLUGIN-003）。
 */

export function seoFactoryApiPath(projectId: string, suffix: string): string {
  const normalized = suffix.replace(/^\/+/, "");
  return `/api/v1/projects/${projectId}/seo-factory/${normalized}`;
}
