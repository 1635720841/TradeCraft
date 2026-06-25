/**
 * 将 Markdown 表格转为 Semrush Quill 可识别的段落/列表 HTML（Quill 不支持 table）。
 */

export function buildSemrushTableRowHtml(
  header: string[],
  row: string[],
  renderInline: (text: string) => string,
): string {
  const cells = header.map((label, index) => {
    const value = row[index]?.trim();
    if (!value) return null;
    return { label, value, index };
  }).filter((item): item is { label: string; value: string; index: number } => item !== null);

  if (cells.length === 0) return '';

  if (header.length <= 1) {
    return `<p>${renderInline(cells[0].value)}</p>`;
  }

  const [first, ...rest] = cells;
  const detail = rest
    .map((cell) => `<strong>${renderInline(cell.label)}:</strong> ${renderInline(cell.value)}`)
    .join(' · ');
  return detail
    ? `<p><strong>${renderInline(first.value)}</strong> — ${detail}</p>`
    : `<p><strong>${renderInline(first.value)}</strong></p>`;
}

export function buildSemrushTableHtml(
  header: string[],
  rows: string[][],
  renderInline: (text: string) => string,
): string {
  return rows
    .map((row) => buildSemrushTableRowHtml(header, row, renderInline))
    .filter(Boolean)
    .join('');
}
