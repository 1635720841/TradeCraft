/** 企业/项目访问期展示 */

export function formatPeriodWindow(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  if (!start && !end) return "长期有效";
  const fmt = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString("zh-CN") : "不限";
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export function formatPeriodEnd(end: string | null | undefined): string {
  if (!end) return "长期有效";
  return new Date(end).toLocaleDateString("zh-CN");
}
