/**
 * 从 API / 网络异常中提取用户可读错误文案。
 */

export function extractErrorMessage(
  error: unknown,
  fallback = "加载失败，请稍后重试"
): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: string }).message).trim();
    if (message) return message;
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}
