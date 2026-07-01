/** Element Plus 表格行类型断言（DefaultRow → 业务类型） */
export function tableRow<T>(row: unknown): T {
  return row as T;
}
