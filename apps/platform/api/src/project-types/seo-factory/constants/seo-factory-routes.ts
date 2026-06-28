/**
 * SEO 工厂 API 双路由：新前缀 + 旧路径兼容（PLUGIN-003）。
 */

export function seoFactoryRoutes(relativePath: string): string[] {
  const normalized = relativePath.replace(/^\/+/, '');
  return [
    `api/v1/projects/:projectId/${normalized}`,
    `api/v1/projects/:projectId/seo-factory/${normalized}`,
  ];
}
