/**
 * 稿件正文 Markdown ↔ HTML（与 api semrush-content 对齐，供 Quill 编辑）。
 */

import {
  markdownToHtml as sharedMarkdownToHtml,
  markdownToSemrushHtml as sharedMarkdownToSemrushHtml,
  renderDraftStandaloneImageHtml,
  repairMarkdownStructureArtifacts,
  renderMarkdownTableMarkdown,
  splitTableRow,
  isMarkdownTableStart,
  readMarkdownTable,
  countMarkdownTables,
} from "@wm/shared-core";

import {
  imageElementToMarkdown,
  MARKDOWN_IMAGE_WITH_TITLE_RE,
  renderMarkdownImageHtml
} from "./draft-image-width";

export function markdownToHtml(markdown: string): string {
  return sharedMarkdownToHtml(markdown, {
    blockquote: true,
    draftImageBlocks: true,
    draftTableClass: true,
    renderImage: renderMarkdownImageHtml,
    matchStandaloneImageLine: (line) => line.match(MARKDOWN_IMAGE_WITH_TITLE_RE),
    renderStandaloneImage: renderDraftStandaloneImageHtml
  });
}

export function markdownToSemrushHtml(markdown: string): string {
  return sharedMarkdownToSemrushHtml(markdown);
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

export { splitTableRow, isMarkdownTableStart, readMarkdownTable, countMarkdownTables };
