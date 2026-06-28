/**
 * 权限勾选展开：自动附带 PERMISSION_IMPLIES 前置权限。
 */

export function expandPermissionGrantIds(
  ids: string[],
  implies: Record<string, string[]>
): string[] {
  const expanded = new Set(ids);
  for (const id of ids) {
    for (const implied of implies[id] ?? []) {
      expanded.add(implied);
    }
  }
  return [...expanded];
}
