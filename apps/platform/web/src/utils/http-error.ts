/** 从 axios / fetch 错误中提取 API 返回的 message */
export function extractHttpErrorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试"
): string {
  if (!error || typeof error !== "object") return fallback;
  const response = (error as { response?: { data?: { error?: { message?: string } } } })
    .response;
  const apiMessage = response?.data?.error?.message;
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}
