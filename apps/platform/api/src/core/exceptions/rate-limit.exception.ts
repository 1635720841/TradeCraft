/**
 * 429 限流异常。
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '../exceptions/error-codes';

export class RateLimitException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super({ code, message, retryAfterSec }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
