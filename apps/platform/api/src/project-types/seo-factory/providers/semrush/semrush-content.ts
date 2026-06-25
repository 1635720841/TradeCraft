/** Markdown → Semrush Quill 编辑器可用 HTML */

import { buildSemrushTableHtml, repairMarkdownTables } from '@wm/shared-core';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

function parseImageWidthTitle(title: string | undefined | null): number | null {
  if (!title?.trim()) return null;
  const match = title.trim().match(/^width:(\d{1,3})%$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(25, Math.round(value)));
}

function renderMarkdownImageHtml(alt: string, src: string, title?: string | null): string {
  const width = parseImageWidthTitle(title);
  const style =
    width != null && width < 100
      ? ` style="width:${width}%;height:auto;max-width:100%"`
      : '';
  return `<img alt="${escapeHtml(alt)}" src="${escapeHtmlAttr(src)}"${style}>`;
}

const INLINE_MARKDOWN_RE =
  /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

/** 行内 Markdown：图片、链接、粗体、斜体、代码 */
function inlineMarkdownToHtml(text: string): string {
  let html = '';
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_MARKDOWN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      html += escapeHtml(text.slice(lastIndex, index));
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      html += renderMarkdownImageHtml(match[1], match[2], match[3]);
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

/** Markdown 转纯文本（兜底） */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^-\s+/gm, '• ')
    .trim();
}

/** Markdown 转 HTML；`semrushTables` 时将表格展平为 Quill 可识别的段落（Semrush 不支持 table） */
export function markdownToHtml(markdown: string, options?: { semrushTables?: boolean }): string {
  const lines = repairMarkdownTables(markdown).replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const splitTableRow = (line: string): string[] => {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
    return trimmed.split('|').map((cell) => cell.trim());
  };

  const isTableSeparatorLine = (line: string): boolean => {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  };

  const isMarkdownTableRow = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return false;
    if (isTableSeparatorLine(trimmed)) return true;
    return splitTableRow(trimmed).length >= 2;
  };

  const isMarkdownTableStart = (index: number): boolean => {
    if (!isMarkdownTableRow(lines[index])) return false;
    if (index + 1 >= lines.length) return false;
    const nextTrimmed = lines[index + 1].trim();
    if (isTableSeparatorLine(nextTrimmed)) return true;
    return isMarkdownTableRow(lines[index + 1]) && !isTableSeparatorLine(nextTrimmed);
  };

  const renderTable = (headerLine: string, bodyLines: string[]) => {
    const header = splitTableRow(headerLine);
    const rows = bodyLines.map(splitTableRow);
    if (options?.semrushTables) {
      html.push(buildSemrushTableHtml(header, rows, inlineMarkdownToHtml));
      return;
    }
    const parts = [
      '<table><thead><tr>',
      ...header.map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`),
      '</tr></thead><tbody>',
    ];
    for (const row of rows) {
      parts.push('<tr>');
      for (let i = 0; i < header.length; i += 1) {
        parts.push(`<td>${inlineMarkdownToHtml(row[i] ?? '')}</td>`);
      }
      parts.push('</tr>');
    }
    parts.push('</tbody></table>');
    html.push(parts.join(''));
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimEnd().trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    if (isMarkdownTableStart(i)) {
      closeLists();
      const headerLine = lines[i];
      i += 1;
      if (i < lines.length && isTableSeparatorLine(lines[i].trim())) {
        i += 1;
      }
      const bodyLines: string[] = [];
      while (i < lines.length) {
        const rowTrimmed = lines[i].trim();
        if (!rowTrimmed || !isMarkdownTableRow(lines[i]) || isTableSeparatorLine(rowTrimmed)) {
          break;
        }
        bodyLines.push(lines[i]);
        i += 1;
      }
      renderTable(headerLine, bodyLines);
      i -= 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(ordered[1])}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
  }

  closeLists();
  return html.join('') || '<p><br></p>';
}

/** Semrush Quill 编辑器专用：表格展平为带标签的段落，避免单元格文字粘连 */
export function markdownToSemrushHtml(markdown: string): string {
  return markdownToHtml(markdown, { semrushTables: true });
}
