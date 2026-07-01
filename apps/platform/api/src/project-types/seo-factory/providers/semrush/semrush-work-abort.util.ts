/**
 * Semrush 协作式中止错误与 Playwright 关闭检测。
 */

import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';

export function createSemrushAbortedException(message: string): BusinessException {
  return new BusinessException(ErrorCodes.VALIDATION_ERROR, message, { semrushAborted: true });
}

/** RPA 轮询/等待链内部抛出，外层转换为 BusinessException */
export class SemrushAbortSignalError extends Error {
  constructor(message = '任务已暂停，Semrush 检测已取消') {
    super(message);
    this.name = 'SemrushAbortSignalError';
  }
}

export function isSemrushAbortSignalError(error: unknown): boolean {
  return error instanceof SemrushAbortSignalError;
}

export function isPlaywrightTargetClosedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('target page, context or browser has been closed') ||
    message.includes('browser has been closed') ||
    message.includes('context has been closed') ||
    message.includes('page has been closed') ||
    message.includes('execution context was destroyed')
  );
}

export function toSemrushAbortedIfNeeded(
  error: unknown,
  fallbackMessage: string,
): BusinessException | null {
  if (error instanceof BusinessException && error.context?.semrushAborted === true) {
    return error;
  }
  if (isSemrushAbortSignalError(error)) {
    const message = error instanceof Error ? error.message : fallbackMessage;
    return createSemrushAbortedException(message || fallbackMessage);
  }
  if (isPlaywrightTargetClosedError(error)) {
    return createSemrushAbortedException(fallbackMessage);
  }
  return null;
}
