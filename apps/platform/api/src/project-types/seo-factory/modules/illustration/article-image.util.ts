/**
 * 正文 Markdown 图片计数与记录类型。
 */

export type ArticleImageSource = 'bfl' | 'upload' | 'url';

export interface ArticleImageRecord {
  alt: string;
  url: string;
  source: ArticleImageSource;
  insertAfterHeading?: string;
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/g;

export function countMarkdownImages(content: string): number {
  return (content.match(MARKDOWN_IMAGE_RE) ?? []).length;
}

/** 移除正文中全部 Markdown 图片（重跑自动配图前清理遗留插图） */
export function stripAllMarkdownImages(content: string): string {
  return content
    .replace(MARKDOWN_IMAGE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
