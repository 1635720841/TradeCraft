/**
 * 可发布 HTML 文档拼装（M10 导出）。
 *
 * 边界：
 * - 不负责：存储上传
 */

import { markdownToHtml } from '../../providers/semrush/semrush-content';
import { seoFactoryApiPath } from '../../constants/seo-factory-routes';

export interface ExportHtmlInput {
  title: string;
  metaDescription?: string;
  contentMarkdown: string;
  jsonLd: Record<string, unknown>;
  suffixHtml?: string;
}

/** 导出 HTML 正文排版（含表格） */
const EXPORT_ARTICLE_STYLES = `
  body {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.75;
    color: #111827;
    background: #fff;
  }
  article {
    max-width: 760px;
    margin: 0 auto;
    padding: 2rem 1.25rem 3rem;
  }
  article > h1 {
    font-size: 2rem;
    line-height: 1.25;
    margin: 0 0 1.5rem;
  }
  article h2 {
    font-size: 1.35rem;
    margin: 1.75rem 0 0.75rem;
  }
  article h3 {
    font-size: 1.15rem;
    margin: 1.25rem 0 0.5rem;
  }
  article p {
    margin: 0.75rem 0;
  }
  article ul, article ol {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
  }
  article blockquote {
    margin: 1rem 0;
    padding-left: 1rem;
    border-left: 3px solid #d1d5db;
    color: #4b5563;
  }
  article img {
    max-width: 100%;
    height: auto;
    border-radius: 0.375rem;
  }
  article table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.25rem 0;
    font-size: 0.95rem;
  }
  article th,
  article td {
    border: 1px solid #d1d5db;
    padding: 0.55rem 0.75rem;
    text-align: left;
    vertical-align: top;
  }
  article th {
    background: #f3f4f6;
    font-weight: 600;
  }
  article tr:nth-child(even) td {
    background: #fafafa;
  }
`;

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
  <style>${EXPORT_ARTICLE_STYLES}</style>
  <script type="application/ld+json">${jsonLdScript}</script>
</head>
<body>
  <article>
    <h1>${title}</h1>
    ${bodyHtml}
  </article>
  ${input.suffixHtml ?? ''}
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
  return seoFactoryApiPath(projectId, `article-jobs/${jobId}/export/html`);
}
