/** TipTap 灌入/导出前 HTML 预处理（与 markdownToHtml 输出对齐） */

export function prepareHtmlForTipTap(html: string): string {
  if (!html.trim()) return "<p></p>";

  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll(".draft-table-wrap").forEach((wrap) => {
    const table = wrap.querySelector("table");
    if (table) wrap.replaceWith(table);
  });

  doc.querySelectorAll(".draft-image-block").forEach((block) => {
    const img = block.querySelector("img");
    if (img) block.replaceWith(img);
  });

  const body = doc.body.innerHTML.trim();
  return body || "<p></p>";
}
