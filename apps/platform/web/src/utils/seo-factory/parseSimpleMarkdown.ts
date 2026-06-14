/**
 * 轻量 Markdown 解析：仅支持初稿中常见的 ## / ### / 列表 / 段落。
 */

export interface MarkdownBlock {
  type: "h2" | "h3" | "p" | "ul" | "img";
  text?: string;
  items?: string[];
  alt?: string;
  src?: string;
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

  for (const line of lines) {
    const trimmed = line.trim();
    const image = trimmed.match(IMAGE_LINE_RE);
    if (image) {
      flushList();
      blocks.push({ type: "img", alt: image[1], src: image[2] });
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "h2", text: line.slice(3) });
    } else if (line.startsWith("### ")) {
      flushList();
      blocks.push({ type: "h3", text: line.slice(4) });
    } else if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
    } else if (line.trim()) {
      flushList();
      blocks.push({ type: "p", text: line });
    }
  }

  flushList();
  return blocks;
}
