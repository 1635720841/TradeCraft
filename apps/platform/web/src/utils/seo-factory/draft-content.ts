/**
 * 稿件正文 Markdown ↔ HTML（与 api semrush-content.ts 对齐，供 Quill 编辑）。
 */

import { buildSemrushTableHtml, repairMarkdownStructureArtifacts, repairMarkdownTables } from "@wm/shared-core";

import {
  isMarkdownTableRow,
  isMarkdownTableStart,
  isTableSeparatorLine,
  readMarkdownTable,
  renderMarkdownTableHtml,
  renderMarkdownTableMarkdown,
  splitTableRow
} from "./markdown-table";
import {
  buildImageWidthStyleAttr,
  imageElementToMarkdown,
  MARKDOWN_IMAGE_WITH_TITLE_RE,
  parseImageWidthTitle,
  renderMarkdownImageHtml
} from "./draft-image-width";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, "&#39;");
}

const INLINE_MARKDOWN_RE =
  /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

function inlineMarkdownToHtml(text: string): string {
  let html = "";
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

/** Markdown → HTML（TipTap / 导出预览；保留真实 table） */
export function markdownToHtml(markdown: string): string {
  return markdownToHtmlInternal(markdown, false);
}

/** Semrush Quill 粘贴专用：表格展平为段落，避免 Quill 丢 table 后粘连文字 */
export function markdownToSemrushHtml(markdown: string): string {
  return markdownToHtmlInternal(markdown, true);
}

function markdownToHtmlInternal(markdown: string, semrushTables: boolean): string {
  const lines = repairMarkdownTables(markdown).replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
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
        semrushTables
          ? buildSemrushTableHtml(table.header, table.rows, inlineMarkdownToHtml)
          : renderMarkdownTableHtml(table.header, table.rows, inlineMarkdownToHtml)
      );
      i = table.nextIndex - 1;
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
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(ordered[1])}</li>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeLists();
      html.push(`<blockquote>${inlineMarkdownToHtml(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    const imageOnly = trimmed.match(MARKDOWN_IMAGE_WITH_TITLE_RE);
    if (imageOnly) {
      closeLists();
      const width = parseImageWidthTitle(imageOnly[3]);
      const style = buildImageWidthStyleAttr(width);
      html.push(
        `<p class="draft-image-block"><img alt="${escapeHtml(imageOnly[1])}" src="${escapeHtmlAttr(imageOnly[2])}"${style}></p>`
      );
      continue;
    }

    if (isMarkdownTableRow(rawLine) && !isTableSeparatorLine(trimmed)) {
      closeLists();
      html.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
  }

  closeLists();
  return html.join("") || "<p><br></p>";
}

function inlineNodesToMarkdown(parent: ParentNode): string {
  let out = "";

  parent.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = inlineNodesToMarkdown(el);

    if (tag === "strong" || tag === "b") out += `**${inner}**`;
    else if (tag === "em" || tag === "i") out += `*${inner}*`;
    else if (tag === "u") out += inner;
    else if (tag === "s" || tag === "strike" || tag === "del") out += inner;
    else if (tag === "code") out += `\`${inner}\``;
    else if (tag === "a") out += `[${inner}](${el.getAttribute("href") ?? ""})`;
    else if (tag === "br") out += "\n";
    else if (tag === "img") {
      out += imageElementToMarkdown(el as HTMLImageElement);
    } else out += inner;
  });

  return out;
}

function tableElementToMarkdown(el: Element): string {
  const rows: string[][] = [];
  el.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("th, td")).map((cell) =>
      inlineNodesToMarkdown(cell).trim()
    );
    if (cells.length) rows.push(cells);
  });

  if (!rows.length) return "";
  const [header, ...body] = rows;
  return renderMarkdownTableMarkdown(header, body);
}

function blockElementToMarkdown(el: Element): string {
  const tag = el.tagName.toLowerCase();

  if (tag === "table") {
    return tableElementToMarkdown(el);
  }

  if (tag === "div") {
    const table = el.querySelector("table");
    if (table) return tableElementToMarkdown(table);

    const img = el.querySelector("img");
    if (img && !el.textContent?.replace(/\u00a0/g, " ").trim()) {
      return imageElementToMarkdown(img as HTMLImageElement);
    }
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    return `${"#".repeat(level)} ${inlineNodesToMarkdown(el).trim()}`;
  }

  if (tag === "figure") {
    const img = el.querySelector("img");
    if (img) return imageElementToMarkdown(img as HTMLImageElement);
    return inlineNodesToMarkdown(el).trim();
  }

  if (tag === "p") {
    const text = inlineNodesToMarkdown(el).trim();
    if (!text) return "";
    if (MARKDOWN_IMAGE_WITH_TITLE_RE.test(text)) return text;
    return text;
  }

  if (tag === "ul") {
    return Array.from(el.children)
      .map((li) => `- ${inlineNodesToMarkdown(li).trim()}`)
      .join("\n");
  }

  if (tag === "ol") {
    return Array.from(el.children)
      .map((li, index) => `${index + 1}. ${inlineNodesToMarkdown(li).trim()}`)
      .join("\n");
  }

  if (tag === "blockquote") {
    return inlineNodesToMarkdown(el)
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (tag === "img") {
    return imageElementToMarkdown(el as HTMLImageElement);
  }

  if (tag === "pre") {
    const code = el.querySelector("code");
    const text = (code?.textContent ?? el.textContent ?? "").trim();
    return text ? `\`\`\`\n${text}\n\`\`\`` : "";
  }

  return inlineNodesToMarkdown(el).trim();
}

/** Quill HTML → Markdown（保存到后端） */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";

  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: string[] = [];

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (text) blocks.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const markdown = blockElementToMarkdown(node as Element).trim();
    if (markdown) blocks.push(markdown);
  });

  return repairMarkdownStructureArtifacts(
    blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
  );
}

export { splitTableRow, isMarkdownTableStart, readMarkdownTable };
