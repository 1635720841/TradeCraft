/**
 * 内链编辑：增删改 Markdown 正文链接与 internalLinks 元数据。
 */

import {
  inferPageTypeFromUrl,
  type InternalLinkRecord,
} from '../linking/link-match.util';

export interface InternalLinkEdit {
  anchorText: string;
  targetUrl: string;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function removeLinkMarkdownFromContent(
  content: string,
  anchorText: string,
  targetUrl: string,
): string {
  const linkPattern = `\\[${escapeRegex(anchorText)}\\]\\(${escapeRegex(targetUrl)}\\)`;
  let updated = content;

  updated = updated.replace(new RegExp(`\\(\\s*${linkPattern}\\s*\\)\\.?`, 'g'), '.');
  updated = updated.replace(new RegExp(`\\s*\\(${linkPattern}\\)`, 'g'), '');
  updated = updated.replace(new RegExp(linkPattern, 'g'), '');
  updated = updated.replace(/ \./g, '.').replace(/\(\s*\)/g, '');
  updated = updated.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n');

  return updated;
}

export function insertInternalLinkMarkdown(
  content: string,
  markdown: string,
  insertAfterHeading?: string,
): string {
  const trimmed = content.trimEnd();
  const sentence = `Related: ${markdown}.`;

  if (!insertAfterHeading?.trim()) {
    return trimmed ? `${trimmed}\n\n${sentence}` : sentence;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const headingPattern = new RegExp(`^##\\s+${escapeRegex(insertAfterHeading.trim())}\\s*$`, 'i');
  const headingIndex = lines.findIndex((line) => headingPattern.test(line));

  if (headingIndex < 0) {
    return trimmed ? `${trimmed}\n\n${sentence}` : sentence;
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
  return after ? `${before}\n\n${sentence}\n\n${after}` : `${before}\n\n${sentence}`;
}

export function mergeInternalLinkEdits(
  existing: InternalLinkRecord[],
  edits: InternalLinkEdit[],
): InternalLinkRecord[] {
  const usedIndexes = new Set<number>();

  return edits.map((edit) => {
    const anchorText = edit.anchorText.trim();
    const targetUrl = edit.targetUrl.trim();

    let baseIndex = existing.findIndex(
      (item, index) =>
        !usedIndexes.has(index) &&
        item.anchorText === anchorText &&
        item.targetUrl === targetUrl,
    );

    if (baseIndex < 0) {
      baseIndex = existing.findIndex(
        (item, index) => !usedIndexes.has(index) && item.targetUrl === targetUrl,
      );
    }

    const base = baseIndex >= 0 ? existing[baseIndex] : undefined;
    if (baseIndex >= 0) usedIndexes.add(baseIndex);

    return {
      anchorText,
      targetUrl,
      pageType: base?.pageType ?? inferPageTypeFromUrl(targetUrl),
      confidence: base?.confidence ?? 1,
      matchReason: base?.matchReason ?? 'manual_add',
      insertAfterHeading: base?.insertAfterHeading,
    };
  });
}

export function applyInternalLinkEditsToContent(
  content: string,
  previousLinks: InternalLinkRecord[],
  edits: InternalLinkEdit[],
): { content: string; links: InternalLinkRecord[] } {
  const nextLinks = mergeInternalLinkEdits(previousLinks, edits);
  let updated = content;

  for (const previous of previousLinks) {
    updated = removeLinkMarkdownFromContent(
      updated,
      previous.anchorText,
      previous.targetUrl,
    );
  }

  for (const link of nextLinks) {
    const markdown = `[${link.anchorText}](${link.targetUrl})`;
    updated = insertInternalLinkMarkdown(updated, markdown, link.insertAfterHeading);
  }

  return { content: updated.trim(), links: nextLinks };
}

/** @deprecated 使用 applyInternalLinkEditsToContent */
export function syncInternalLinksInContent(
  content: string,
  previousLinks: InternalLinkRecord[],
  nextLinks: InternalLinkEdit[],
): string {
  return applyInternalLinkEditsToContent(content, previousLinks, nextLinks).content;
}
