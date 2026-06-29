/**
 * Markdown 行内语法 → HTML。
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

export const INLINE_MARKDOWN_RE =
  /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

export function defaultMarkdownImageHtml(
  alt: string,
  src: string,
  title?: string | null,
): string {
  const widthMatch = title?.trim().match(/^width:(\d{1,3})%$/i);
  const width = widthMatch ? Number(widthMatch[1]) : null;
  const style =
    width != null && Number.isFinite(width) && width < 100
      ? ` style="width:${Math.min(100, Math.max(25, Math.round(width)))}%;height:auto;max-width:100%"`
      : '';
  return `<img alt="${escapeHtml(alt)}" src="${escapeHtmlAttr(src)}"${style}>`;
}

export function inlineMarkdownToHtml(
  text: string,
  renderImage: (alt: string, src: string, title?: string | null) => string = defaultMarkdownImageHtml,
): string {
  let html = '';
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_MARKDOWN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      html += escapeHtml(text.slice(lastIndex, index));
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      html += renderImage(match[1], match[2], match[3]);
    } else if (match[4] !== undefined && match[5] !== undefined) {
      html += `<a href="${escapeHtmlAttr(match[5])}">${escapeHtml(match[4])}</a>`;
    } else if (match[6] !== undefined) {
      html += `<strong>${escapeHtml(match[6])}</strong>`;
    } else if (match[7] !== undefined) {
      html += `<em>${escapeHtml(match[7])}</em>`;
    } else if (match[8] !== undefined) {
      html += `<code>${escapeHtml(match[8])}</code>`;
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    html += escapeHtml(text.slice(lastIndex));
  }

  return html;
}
