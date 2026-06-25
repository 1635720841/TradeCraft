/**
 * 修复被 LLM 压平或粘连的 Markdown 表格，便于 Semrush HTML 转换。
 *
 * 典型损坏：`||` 行粘连、分隔符 `|---|` 嵌在段落中、表头与正文同一行。
 */

function cleanTableCell(cell: string): string {
  return cell.trim().replace(/^\.\s+/, '').replace(/\s+\.$/, '.');
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cleanTableCell(cell));
}

function isTableSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line).map((cell) => cell.replace(/\.$/, '').trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableDataRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (isTableSeparatorRow(trimmed)) return true;
  return splitTableRow(trimmed).length >= 2;
}

function formatTableRow(cells: string[]): string {
  const trimmed = cells.map((cell) => cell.trim()).filter((cell, index, all) => {
    return cell.length > 0 || index < all.length - 1;
  });
  return `| ${trimmed.join(' | ')} |`;
}

function normalizeSeparatorRow(columnCount: number): string {
  return formatTableRow(Array.from({ length: columnCount }, () => '---'));
}

function findTableStartIndex(block: string): number {
  const afterColon = block.match(/:\s*(\|[^|\n]+(?:\|[^|\n]+)+)/);
  if (afterColon?.[1]) {
    const index = block.indexOf(afterColon[1], afterColon.index);
    if (index >= 0) return index;
  }

  const afterSentence = block.match(/[.!?]\s+(\|[^|\n]+(?:\|[^|\n]+)+)/);
  if (afterSentence?.[1]) {
    const index = block.indexOf(afterSentence[1], afterSentence.index);
    if (index >= 0) return index;
  }

  const trimmed = block.trimStart();
  if (trimmed.startsWith('|')) {
    return block.length - trimmed.length;
  }

  const separatorMatch = block.match(/\|[\s.:]*-{3,}/);
  if (separatorMatch?.index != null) {
    const before = block.slice(0, separatorMatch.index).replace(/\|\s*$/g, '').trimEnd();
    const headerMatch = before.match(/(\|[^|\n]+(?:\|[^|\n]+)+)\s*$/);
    if (headerMatch?.[1]) {
      return before.lastIndexOf(headerMatch[1]);
    }
  }

  const match = block.match(/\|[^|\n]+(?:\|[^|\n]+)+/);
  if (match?.index != null) return match.index;
  return -1;
}

function hasMalformedMarkdownTable(content: string): boolean {
  if (!content.includes('|')) return false;
  if (/\|\s*\|/.test(content)) return true;
  if (/[.!?]\s+\|[^|\n]+\|/.test(content)) return true;
  if (/:\s*\|[^|\n]+\|/.test(content)) return true;
  if (/[^\n]\|[\s.:]*-{3,}/.test(content)) return true;
  return false;
}

function repairTableFragment(table: string): string {
  let normalized = table
    .replace(/\|\s*\|/g, '|\n|')
    .replace(/\|[\s.]*(\|[\s.:]*-{3,})/g, '\n$1');

  const rawLines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: string[] = [];
  for (const line of rawLines) {
    if (!isTableDataRow(line)) {
      if (rows.length > 0) {
        rows[rows.length - 1] = `${rows[rows.length - 1]} ${line}`.trim();
      }
      continue;
    }
    rows.push(line);
  }

  if (rows.length < 2) return table;

  const cleanedRows = rows.map((row) => {
    let current = row.trim();
    if (!current.startsWith('|')) current = `| ${current}`;
    if (!current.endsWith('|')) current = `${current} |`;
    current = current.replace(/^\|[\s.]+(?=-{3,})/, '| ');
    if (isTableSeparatorRow(current)) {
      const columnCount = splitTableRow(current).length;
      return normalizeSeparatorRow(columnCount);
    }
    return current;
  });

  const headerCells = splitTableRow(cleanedRows[0]);
  const columnCount = headerCells.length;
  if (columnCount < 2) return table;

  const output: string[] = [formatTableRow(headerCells)];
  const trailingProse: string[] = [];

  let bodyStart = 1;
  if (cleanedRows.length > 1 && isTableSeparatorRow(cleanedRows[1])) {
    output.push(normalizeSeparatorRow(columnCount));
    bodyStart = 2;
  }

  for (let i = bodyStart; i < cleanedRows.length; i += 1) {
    if (isTableSeparatorRow(cleanedRows[i])) continue;
    const cells = splitTableRow(cleanedRows[i]);
    if (cells.length > columnCount) {
      const overflow = cells.slice(columnCount).join(' ').trim();
      if (overflow) trailingProse.push(overflow);
    }
    while (cells.length < columnCount) cells.push('');
    output.push(formatTableRow(cells.slice(0, columnCount)));
  }

  if (output.length < 2) return table;
  return trailingProse.length > 0
    ? `${output.join('\n')}\n\n${trailingProse.join(' ')}`
    : output.join('\n');
}

function repairTableBlock(block: string): string {
  if (!block.includes('|') || !hasMalformedMarkdownTable(block)) return block;

  const start = findTableStartIndex(block);
  if (start < 0) return block;

  const prefix = block.slice(0, start).trim();
  const table = repairTableFragment(block.slice(start));
  if (table === block.slice(start)) return block;

  return prefix ? `${prefix}\n\n${table}` : table;
}

/** 将压平/粘连的 Markdown 表格恢复为每行一行的标准格式。 */
export function repairMarkdownTables(content: string): string {
  if (!content.includes('|') || !hasMalformedMarkdownTable(content)) return content;

  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/);
  const repaired = blocks.map((block) => repairTableBlock(block.trim())).filter(Boolean);
  return repaired.join('\n\n');
}

export { hasMalformedMarkdownTable };
