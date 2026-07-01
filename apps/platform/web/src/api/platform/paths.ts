/**
 * 平台层 API 路径（跨 project-type 复用）。
 */

export function platformApiPath(projectId: string, suffix: string): string {
  const normalized = suffix.replace(/^\/+/, "");
  return `/api/v1/projects/${projectId}/${normalized}`;
}
