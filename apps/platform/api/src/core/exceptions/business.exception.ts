/**
 * 业务异常：可预期的 4xx 错误。
 *
 * 边界：
 * - 不负责：HTTP 响应格式化（由 GlobalExceptionFilter 处理）
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

export class BusinessException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super({ code, message }, HttpStatus.BAD_REQUEST);
  }
}
