/**
 * 轻量 Markdown 解析：标题、列表、段落、表格、图片。
 */

import {
  isMarkdownTableRow,
  isMarkdownTableStart,
  isTableSeparatorLine,
  readMarkdownTable
} from "./markdown-table";

export interface MarkdownBlock {
  type: "h1" | "h2" | "h3" | "p" | "ul" | "img" | "table";
  text?: string;
  items?: string[];
  alt?: string;
  src?: string;
  header?: string[];
  rows?: string[][];
}

const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

export function parseSimpleMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split("\n");
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length) {
      blocks.push({ type: "ul", items: [...listItems] });
      listItems = [];
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const image = trimmed.match(IMAGE_LINE_RE);
    if (image) {
      flushList();
      blocks.push({ type: "img", alt: image[1], src: image[2] });
      continue;
    }

    if (isMarkdownTableStart(lines, i)) {
      flushList();
      const table = readMarkdownTable(lines, i);
      blocks.push({ type: "table", header: table.header, rows: table.rows });
      i = table.nextIndex - 1;
      continue;
    }

    if (line.startsWith("### ")) {
      flushList();
      blocks.push({ type: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "h2", text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      flushList();
      blocks.push({ type: "h1", text: line.slice(2) });
    } else if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
    } else if (trimmed && !isTableSeparatorLine(trimmed) && !isMarkdownTableRow(line)) {
      flushList();
      blocks.push({ type: "p", text: line });
    }
  }

  flushList();
  return blocks;
}
