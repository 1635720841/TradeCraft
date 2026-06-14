/**
 * 字典工具：从 [{ value, label, type? }] 取展示文案与标签类型。
 */

export type DictTagType = "success" | "warning" | "info" | "danger" | "primary";

export type DictItem = {
  value: string;
  label: string;
  type?: DictTagType;
};

function findItem(dict: readonly DictItem[], value?: string | null) {
  if (value == null || value === "") return undefined;
  return dict.find(item => item.value === value);
}

/** 取展示文案 */
export function dictLabel(
  dict: readonly DictItem[],
  value?: string | null,
  fallback = "-"
): string {
  return findItem(dict, value)?.label ?? fallback;
}

/** 取 el-tag 的 type */
export function dictTagType(
  dict: readonly DictItem[],
  value?: string | null
): DictTagType | undefined {
  return findItem(dict, value)?.type;
}

/** 取下拉 options */
export function dictOptions(dict: readonly DictItem[]) {
  return dict.map(({ value, label }) => ({ value, label }));
}
