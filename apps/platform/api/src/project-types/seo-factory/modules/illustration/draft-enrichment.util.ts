/**
 * 初稿增强项（内链、配图）与正文 reconciler：AI 优化会重写正文，需把已植入项补回。
 */

import type { InternalLinkRecord } from '../linking/link-match.util';
import { countMarkdownImages, type ArticleImageRecord } from './article-image.util';
import { insertArticleImageMarkdown } from './article-images-edit.util';

export interface DraftEnrichmentInput {
  content: string;
  internalLinks?: InternalLinkRecord[];
  articleImages?: ArticleImageRecord[];
}

function contentHasUrl(content: string, url: string): boolean {
  return content.includes(url);
}

function reinsertInternalLink(content: string, link: InternalLinkRecord): string {
  if (contentHasUrl(content, link.targetUrl)) return content;

  const markdown = `[${link.anchorText}](${link.targetUrl})`;
  const heading = link.insertAfterHeading?.trim();

  if (heading) {
    const marker = `## ${heading}`;
    const index = content.indexOf(marker);
    if (index >= 0) {
      const lineEnd = content.indexOf('\n', index + marker.length);
      const insertAt = lineEnd >= 0 ? lineEnd + 1 : content.length;
      const prefix = content.slice(0, insertAt);
      const suffix = content.slice(insertAt);
      return `${prefix}\nFor more detail, see ${markdown}.\n${suffix}`.trim();
    }
  }

  return `${content.trim()}\n\nRelated reading: ${markdown}`;
}

function reinsertArticleImage(content: string, image: ArticleImageRecord): string {
  if (contentHasUrl(content, image.url)) return content;
  return insertArticleImageMarkdown(
    content,
    image.alt,
    image.url,
    image.insertAfterHeading,
  );
}

/** 将 metadata 中的内链/配图补回正文（优化轮次可能已删除 Markdown 语法） */
export function mergeDraftEnrichments(input: DraftEnrichmentInput): string {
  let next = input.content.trim();
  if (!next) return next;

  for (const link of input.internalLinks ?? []) {
    next = reinsertInternalLink(next, link);
  }

  for (const image of input.articleImages ?? []) {
    next = reinsertArticleImage(next, image);
  }

  return next.trim();
}

export function draftNeedsEnrichmentMerge(input: DraftEnrichmentInput): boolean {
  const merged = mergeDraftEnrichments(input);
  return merged !== input.content.trim();
}

export function countMissingEnrichments(input: DraftEnrichmentInput): {
  missingLinks: number;
  missingImages: number;
} {
  const content = input.content;
  const missingLinks = (input.internalLinks ?? []).filter(
    (link) => !contentHasUrl(content, link.targetUrl),
  ).length;
  const missingImages = (input.articleImages ?? []).filter(
    (image) => !contentHasUrl(content, image.url),
  ).length;
  return { missingLinks, missingImages };
}

export function hasMinimumImages(content: string, minImages: number): boolean {
  return countMarkdownImages(content) >= minImages;
}
