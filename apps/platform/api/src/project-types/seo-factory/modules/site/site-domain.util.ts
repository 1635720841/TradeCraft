/**
 * 站点域名规范化：去掉协议与尾部斜杠。
 *
 * 边界：
 * - 不负责：DNS 校验
 */

export function normalizeSiteDomain(input: string): string {
  let value = input.trim();
  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/\/+$/, '');
  return value.toLowerCase();
}
