/**
 * Quill 编辑器内稳定表格 DOM，避免被拆成段落。
 * contenteditable 编辑器同样使用：锁定 table 结构，单元格可编辑。
 */

export function stabilizeDraftTables(root: ParentNode) {
  root.querySelectorAll("table").forEach((table) => {
    if (!(table instanceof HTMLTableElement)) return;

    table.classList.add("draft-table");

    const parent = table.parentElement;
    if (!parent?.classList.contains("draft-table-wrap")) {
      const wrapper = document.createElement("div");
      wrapper.className = "draft-table-wrap";
      wrapper.setAttribute("contenteditable", "false");
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    }

    table.setAttribute("contenteditable", "false");
    table.querySelectorAll("th, td").forEach((cell) => {
      cell.setAttribute("contenteditable", "true");
    });
  });
}
