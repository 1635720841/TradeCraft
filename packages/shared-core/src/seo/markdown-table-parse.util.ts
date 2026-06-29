/**
 * Markdown 表格行解析（GFM 风格）。
 */

export function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

export function isTableSeparatorLine(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (isTableSeparatorLine(trimmed)) return true;
  return splitTableRow(trimmed).length >= 2;
}

export function isMarkdownTableStart(lines: string[], index: number): boolean {
  if (!isMarkdownTableRow(lines[index])) return false;
  if (index + 1 >= lines.length) return false;
  const nextTrimmed = lines[index + 1].trim();
  if (isTableSeparatorLine(nextTrimmed)) return true;
  return isMarkdownTableRow(lines[index + 1]) && !isTableSeparatorLine(nextTrimmed);
}

export function readMarkdownTable(lines: string[], startIndex: number) {
  const headerLine = lines[startIndex];
  let index = startIndex + 1;

  if (index < lines.length && isTableSeparatorLine(lines[index].trim())) {
    index += 1;
  }

  const bodyLines: string[] = [];

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed || !isMarkdownTableRow(lines[index]) || isTableSeparatorLine(trimmed)) {
      break;
    }
    bodyLines.push(lines[index]);
    index += 1;
  }

  return {
    header: splitTableRow(headerLine),
    rows: bodyLines.map(splitTableRow),
    nextIndex: index,
  };
}

export function renderMarkdownTableHtml(
  header: string[],
  rows: string[][],
  inlineHtml: (text: string) => string,
  options?: { draftTableClass?: boolean },
) {
  const tableClass = options?.draftTableClass ? ' class="draft-table"' : '';
  const parts = [
    `<table${tableClass}><thead><tr>`,
    ...header.map((cell) => `<th>${inlineHtml(cell)}</th>`),
    '</tr></thead><tbody>',
  ];

  for (const row of rows) {
    parts.push('<tr>');
    for (let i = 0; i < header.length; i += 1) {
      parts.push(`<td>${inlineHtml(row[i] ?? '')}</td>`);
    }
    parts.push('</tr>');
  }

  parts.push('</tbody></table>');
  if (options?.draftTableClass) {
    return `<div class="draft-table-wrap">${parts.join('')}</div>`;
  }
  return parts.join('');
}

export function renderMarkdownTableMarkdown(header: string[], rows: string[][]) {
  const separator = `| ${header.map(() => '---').join(' | ')} |`;
  const lines = [`| ${header.join(' | ')} |`, separator];
  for (const row of rows) {
    lines.push(`| ${header.map((_, index) => row[index] ?? '').join(' | ')} |`);
  }
  return lines.join('\n');
}

export function countMarkdownTables(markdown: string): number {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!isMarkdownTableStart(lines, i)) continue;
    count += 1;
    i = readMarkdownTable(lines, i).nextIndex - 1;
  }
  return count;
}
