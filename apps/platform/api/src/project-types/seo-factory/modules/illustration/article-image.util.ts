/**
 * 正文 Markdown 图片计数与记录类型。
 */

export interface ArticleImageRecord {
  alt: string;
  url: string;
  source: 'bfl';
  insertAfterHeading?: string;
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/g;

export function countMarkdownImages(content: string): number {
  return (content.match(MARKDOWN_IMAGE_RE) ?? []).length;
}
