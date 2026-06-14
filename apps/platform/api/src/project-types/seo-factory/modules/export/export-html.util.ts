/**
 * 可发布 HTML 文档拼装（M10 导出）。
 *
 * 边界：
 * - 不负责：存储上传
 */

import { markdownToHtml } from '../../providers/semrush/semrush-content';

export interface ExportHtmlInput {
  title: string;
  metaDescription?: string;
  contentMarkdown: string;
  jsonLd: Record<string, unknown>;
}

export function buildExportHtmlDocument(input: ExportHtmlInput): string {
  const bodyHtml = markdownToHtml(input.contentMarkdown);
  const description = escapeHtml(input.metaDescription ?? input.title);
  const title = escapeHtml(input.title);
  const jsonLdScript = JSON.stringify(input.jsonLd).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <script type="application/ld+json">${jsonLdScript}</script>
</head>
<body>
  <article>
    <h1>${title}</h1>
    ${bodyHtml}
  </article>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 存储层 object key 前缀 */
export function buildExportStoragePrefix(
  organizationId: string,
  projectId: string,
  jobId: string,
): string {
  return `${organizationId}/${projectId}/${jobId}`;
}

/** API 相对下载路径 */
export function buildExportHtmlUrl(projectId: string, jobId: string): string {
  return `/api/v1/projects/${projectId}/article-jobs/${jobId}/export/html`;
}
