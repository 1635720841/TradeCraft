import { BusinessException } from '../../../../core/exceptions/business.exception';

/** 从 API/批量操作错误中解析用户可读文案 */
export function resolveArticleJobErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BusinessException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      return String((body as { message: string }).message);
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
