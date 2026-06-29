/**
 * Markdown 表格行解析（GFM 风格）— 复用 shared-core，保留 Web 合并工具。
 */
export {
  splitTableRow,
  isTableSeparatorLine,
  isMarkdownTableRow,
  isMarkdownTableStart,
  readMarkdownTable,
  renderMarkdownTableHtml,
  renderMarkdownTableMarkdown,
  countMarkdownTables,
} from "@wm/shared-core";

import {
  isMarkdownTableStart,
  readMarkdownTable,
  countMarkdownTables,
} from "@wm/shared-core";

/** Quill 丢表格时，从 source 恢复 table 块，保留 converted 中的其它编辑 */
export function mergeMarkdownPreservingTables(source: string, converted: string): string {
  if (countMarkdownTables(source) === 0) return converted;
  if (countMarkdownTables(converted) >= countMarkdownTables(source)) return converted;

  const sourceLines = source.replace(/\r\n/g, "\n").split("\n");
  const convertedLines = converted.replace(/\r\n/g, "\n").split("\n");
  const result: string[] = [];
  let sourceIndex = 0;
  let convertedIndex = 0;

  while (sourceIndex < sourceLines.length || convertedIndex < convertedLines.length) {
    if (sourceIndex < sourceLines.length && isMarkdownTableStart(sourceLines, sourceIndex)) {
      const table = readMarkdownTable(sourceLines, sourceIndex);
      result.push(...sourceLines.slice(sourceIndex, table.nextIndex));
      sourceIndex = table.nextIndex;
      while (
        convertedIndex < convertedLines.length &&
        !isMarkdownTableStart(convertedLines, convertedIndex)
      ) {
        result.push(convertedLines[convertedIndex]);
        convertedIndex += 1;
      }
      continue;
    }

    if (convertedIndex < convertedLines.length) {
      result.push(convertedLines[convertedIndex]);
      convertedIndex += 1;
      sourceIndex += 1;
      continue;
    }

    result.push(sourceLines[sourceIndex]);
    sourceIndex += 1;
  }

  return result.join("\n");
}
