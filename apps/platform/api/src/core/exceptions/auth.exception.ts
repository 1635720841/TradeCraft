/**
 * 鉴权相关 HTTP 异常：401 / 403，带统一 error.code。
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

export class UnauthorizedException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super({ code, message }, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super({ code, message }, HttpStatus.FORBIDDEN);
  }
}
