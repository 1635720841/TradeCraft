/**
 * 业务异常：可预期的 4xx 错误。
 *
 * 边界：
 * - 不负责：HTTP 响应格式化（由 GlobalExceptionFilter 处理）
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes';
import { ErrorCodes } from './error-codes';

function defaultStatusForCode(code: ErrorCode): HttpStatus {
  if (code === ErrorCodes.FORBIDDEN) return HttpStatus.FORBIDDEN;
  return HttpStatus.BAD_REQUEST;
}

export class BusinessException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
    status: HttpStatus = defaultStatusForCode(code),
  ) {
    super({ code, message }, status);
  }
}
