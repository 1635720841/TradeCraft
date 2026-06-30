/**
 * 危险删除二次确认：须完整输入指定文字才可提交。
 */

import { ElMessageBox } from "element-plus";

export async function confirmDestructiveDelete(options: {
  title?: string;
  description: string;
  expectedText: string;
}): Promise<void> {
  const expected = options.expectedText.trim();
  if (!expected) {
    throw new Error("expectedText is required");
  }

  await ElMessageBox.prompt(
    `${options.description}\n\n请输入「${expected}」以确认删除。`,
    options.title ?? "删除确认",
    {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      confirmButtonClass: "el-button--danger",
      inputPlaceholder: expected,
      inputValidator: (value) =>
        value?.trim() === expected ? true : `请输入「${expected}」以确认删除`
    }
  );
}
