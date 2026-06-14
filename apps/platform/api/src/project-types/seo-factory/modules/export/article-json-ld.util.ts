/**
 * Article JSON-LD 生成（M10 导出）。
 *
 * 边界：
 * - 不负责：HTML 正文拼装
 */

export interface ArticleJsonLdInput {
  title: string;
  description?: string;
  content: string;
  siteDomain: string;
  targetKeyword: string;
  publishedAt?: string;
}

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const url = `https://${normalizeDomain(input.siteDomain)}/`;
  const wordCount = input.content.trim().split(/\s+/).filter(Boolean).length;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description ?? input.targetKeyword,
    keywords: input.targetKeyword,
    wordCount,
    datePublished: input.publishedAt ?? new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: normalizeDomain(input.siteDomain),
    },
    publisher: {
      '@type': 'Organization',
      name: normalizeDomain(input.siteDomain),
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
