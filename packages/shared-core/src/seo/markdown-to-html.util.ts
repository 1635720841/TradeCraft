/**
 * Markdown → HTML（API Semrush RPA 与 Web 预览共用）。
 */

import { repairMarkdownStructureArtifacts } from './semrush-structure.util';
import { repairMarkdownTables } from './markdown-table-repair.util';
import { buildSemrushTableHtml } from './markdown-table-semrush.util';
import {
  defaultMarkdownImageHtml,
  escapeHtml,
  escapeHtmlAttr,
  inlineMarkdownToHtml,
} from './markdown-inline.util';
import {
  isMarkdownTableRow,
  isMarkdownTableStart,
  isTableSeparatorLine,
  readMarkdownTable,
  renderMarkdownTableHtml,
} from './markdown-table-parse.util';

export interface MarkdownToHtmlOptions {
  /** 表格展平为 Quill 段落（Semrush 不支持 table） */
  semrushTables?: boolean;
  /** 支持 `> ` 引用块 */
  blockquote?: boolean;
  /** 独立图片行包一层 draft-image-block */
  draftImageBlocks?: boolean;
  /** 表格使用 draft-table 样式包裹 */
  draftTableClass?: boolean;
  /** 自定义行内图片渲染 */
  renderImage?: (alt: string, src: string, title?: string | null) => string;
  /** 独立图片行检测（返回 match 时走 standalone 渲染） */
  matchStandaloneImageLine?: (line: string) => RegExpMatchArray | null;
  /** 独立图片行 HTML */
  renderStandaloneImage?: (alt: string, src: string, title?: string | null) => string;
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^-\s+/gm, '• ')
    .trim();
}

export function markdownToHtml(markdown: string, options: MarkdownToHtmlOptions = {}): string {
  const renderImage = options.renderImage ?? defaultMarkdownImageHtml;
  const inlineHtml = (text: string) => inlineMarkdownToHtml(text, renderImage);

  const lines = repairMarkdownStructureArtifacts(repairMarkdownTables(markdown))
    .replace(/\r\n/g, '\n')
    .split('\n');
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

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimEnd().trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    if (isMarkdownTableStart(lines, i)) {
      closeLists();
      const table = readMarkdownTable(lines, i);
      html.push(
        options.semrushTables
          ? buildSemrushTableHtml(table.header, table.rows, inlineHtml)
          : renderMarkdownTableHtml(table.header, table.rows, inlineHtml, {
              draftTableClass: options.draftTableClass,
            }),
      );
      i = table.nextIndex - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`);
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
      html.push(`<li>${inlineHtml(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
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
      html.push(`<li>${inlineHtml(ordered[1])}</li>`);
      continue;
    }

    if (options.blockquote && trimmed.startsWith('> ')) {
      closeLists();
      html.push(`<blockquote>${inlineHtml(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    if (options.draftImageBlocks && options.matchStandaloneImageLine && options.renderStandaloneImage) {
      const imageOnly = options.matchStandaloneImageLine(trimmed);
      if (imageOnly) {
        closeLists();
        html.push(options.renderStandaloneImage(imageOnly[1], imageOnly[2], imageOnly[3]));
        continue;
      }
    }

    if (isMarkdownTableRow(rawLine) && !isTableSeparatorLine(trimmed)) {
      closeLists();
      html.push(`<p>${inlineHtml(trimmed)}</p>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineHtml(trimmed)}</p>`);
  }

  closeLists();
  return html.join('') || '<p><br></p>';
}

export function markdownToSemrushHtml(markdown: string): string {
  return markdownToHtml(markdown, { semrushTables: true });
}

export function renderDraftStandaloneImageHtml(
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
  return `<p class="draft-image-block"><img alt="${escapeHtml(alt)}" src="${escapeHtmlAttr(src)}"${style}></p>`;
}
