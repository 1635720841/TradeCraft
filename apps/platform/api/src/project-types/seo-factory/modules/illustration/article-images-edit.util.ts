/**
 * 配图编辑：增删改 Markdown 正文图片与 articleImages 元数据。
 */

import type { ArticleImageRecord } from './article-image.util';

export interface ArticleImageEdit {
  alt: string;
  url: string;
  source?: ArticleImageRecord['source'];
  insertAfterHeading?: string;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function removeImageMarkdownFromContent(content: string, url: string): string {
  const escapedUrl = escapeRegex(url.trim());
  let updated = content.replace(
    new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, 'g'),
    '',
  );
  updated = updated.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
  return updated.trim();
}

export function insertArticleImageMarkdown(
  content: string,
  alt: string,
  url: string,
  insertAfterHeading?: string,
): string {
  const markdown = `![${alt}](${url})`;
  const trimmed = content.trimEnd();

  if (!insertAfterHeading?.trim()) {
    return trimmed ? `${trimmed}\n\n${markdown}` : markdown;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const headingPattern = new RegExp(`^##\\s+${escapeRegex(insertAfterHeading.trim())}\\s*$`, 'i');
  const headingIndex = lines.findIndex((line) => headingPattern.test(line));

  if (headingIndex < 0) {
    return trimmed ? `${trimmed}\n\n${markdown}` : markdown;
  }

  let endIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? '')) {
      endIndex = index;
      break;
    }
  }

  const before = lines.slice(0, endIndex).join('\n').trimEnd();
  const after = lines.slice(endIndex).join('\n').trimStart();
  return after ? `${before}\n\n${markdown}\n\n${after}` : `${before}\n\n${markdown}`;
}

export function mergeArticleImageEdits(
  existing: ArticleImageRecord[],
  edits: ArticleImageEdit[],
): ArticleImageRecord[] {
  const usedIndexes = new Set<number>();

  return edits.map((edit) => {
    const alt = edit.alt.trim();
    const url = edit.url.trim();

    let baseIndex = existing.findIndex(
      (item, index) => !usedIndexes.has(index) && item.url === url,
    );

    if (baseIndex < 0) {
      baseIndex = existing.findIndex(
        (item, index) => !usedIndexes.has(index) && item.alt === alt,
      );
    }

    const base = baseIndex >= 0 ? existing[baseIndex] : undefined;
    if (baseIndex >= 0) usedIndexes.add(baseIndex);

    return {
      alt,
      url,
      source: edit.source ?? base?.source ?? 'upload',
      insertAfterHeading: edit.insertAfterHeading?.trim() || base?.insertAfterHeading,
    };
  });
}

export function applyArticleImageEditsToContent(
  content: string,
  previousImages: ArticleImageRecord[],
  edits: ArticleImageEdit[],
): { content: string; images: ArticleImageRecord[] } {
  const nextImages = mergeArticleImageEdits(previousImages, edits);
  let updated = content;

  for (const previous of previousImages) {
    updated = removeImageMarkdownFromContent(updated, previous.url);
  }

  for (const image of nextImages) {
    updated = insertArticleImageMarkdown(
      updated,
      image.alt,
      image.url,
      image.insertAfterHeading,
    );
  }

  return { content: updated.trim(), images: nextImages };
}
