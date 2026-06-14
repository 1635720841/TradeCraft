/**
 * 行内 Markdown 片段：支持 [锚文本](url) 链接。
 */

export interface InlineMarkdownSegment {
  type: "text" | "link";
  text: string;
  href?: string;
}

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

export function parseInlineMarkdown(text: string): InlineMarkdownSegment[] {
  const segments: InlineMarkdownSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, index) });
    }
    segments.push({
      type: "link",
      text: match[1],
      href: match[2]
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", text });
  }

  return segments;
}
