/**
 * 全局异常过滤器：统一 { error: { code, message, traceId } } 响应格式，并记录服务端日志。
 *
 * 边界：
 * - 不负责：业务异常抛出
 *
 * 入口：
 * - GlobalExceptionFilter
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../logger/logger.service';
import { readRequestContext } from '../context/request-context.store';
import { BusinessException } from './business.exception';
import { ErrorCodes } from './error-codes';
import { RateLimitException } from './rate-limit.exception';

interface HttpExceptionBody {
  code?: string;
  message?: string | string[];
  error?: string;
  statusCode?: number;
  retryAfterSec?: number;
}

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const traceId = this.resolveTraceId(request);
    const reqCtx = readRequestContext(request as unknown as Record<string, unknown>);
    const { status, code, message, retryAfterSec } = this.resolveException(exception);

    this.logException(exception, {
      traceId,
      status,
      code,
      message,
      method: request.method,
      path: request.url,
      organizationId: reqCtx?.organizationId,
      userId: reqCtx?.userId,
    });

    if (retryAfterSec != null && retryAfterSec > 0) {
      response.setHeader('Retry-After', String(retryAfterSec));
    }

    response.status(status).json({
      error: {
        code,
        message,
        traceId,
        ...(retryAfterSec != null && retryAfterSec > 0 ? { retryAfterSec } : {}),
      },
    });
  }

  private resolveTraceId(request: Request): string {
    const header = request.headers['x-trace-id'];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
    return `tr_${uuidv4()}`;
  }

  private resolveException(exception: unknown): {
    status: number;
    code: string;
    message: string;
    retryAfterSec?: number;
  } {
    if (exception instanceof RateLimitException) {
      const body = exception.getResponse() as { message?: string; retryAfterSec?: number };
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: body.message ?? '请求过于频繁，请稍后重试',
        retryAfterSec: exception.retryAfterSec ?? body.retryAfterSec,
      };
    }

    if (exception instanceof BusinessException) {
      const body = exception.getResponse() as { message?: string };
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: body.message ?? '请求失败',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const err = body as HttpExceptionBody;

        if (typeof err.code === 'string' && err.code.length > 0) {
          return {
            status,
            code: err.code,
            message: this.normalizeMessage(err.message) ?? exception.message,
            retryAfterSec: err.retryAfterSec,
          };
        }

        if (Array.isArray(err.message)) {
          return {
            status,
            code: ErrorCodes.VALIDATION_ERROR,
            message: err.message.join('；'),
          };
        }

        if (typeof err.message === 'string') {
          return {
            status,
            code: this.codeFromStatus(status),
            message: err.message,
          };
        }
      }

      if (typeof body === 'string') {
        return { status, code: this.codeFromStatus(status), message: body };
      }

      return {
        status,
        code: this.codeFromStatus(status),
        message: exception.message,
      };
    }

    if (exception instanceof Error) {
      if (exception.name === 'PayloadTooLargeError') {
        return {
          status: HttpStatus.PAYLOAD_TOO_LARGE,
          code: ErrorCodes.PAYLOAD_TOO_LARGE,
          message: '请求体过大，请缩短正文后重试（单篇建议不超过 20 万字符）',
        };
      }

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCodes.UNKNOWN,
        message: '服务器内部错误',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.UNKNOWN,
      message: '服务器内部错误',
    };
  }

  private codeFromStatus(status: number): string {
    if (status === HttpStatus.UNAUTHORIZED) return ErrorCodes.UNAUTHORIZED;
    if (status === HttpStatus.FORBIDDEN) return ErrorCodes.FORBIDDEN;
    if (status === HttpStatus.NOT_FOUND) return ErrorCodes.NOT_FOUND;
    if (status === HttpStatus.BAD_REQUEST) return ErrorCodes.VALIDATION_ERROR;
    if (status === HttpStatus.TOO_MANY_REQUESTS) return ErrorCodes.RATE_LIMIT_EXCEEDED;
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) return ErrorCodes.PAYLOAD_TOO_LARGE;
    return ErrorCodes.UNKNOWN;
  }

  private normalizeMessage(message?: string | string[]): string | undefined {
    if (Array.isArray(message)) {
      return message.join('；');
    }
    return message;
  }

  private logException(
    exception: unknown,
    ctx: {
      traceId: string;
      status: number;
      code: string;
      message: string;
      method: string;
      path: string;
      organizationId?: string;
      userId?: string;
    },
  ): void {
    const payload = {
      traceId: ctx.traceId,
      action: 'exception.http',
      status: ctx.status,
      code: ctx.code,
      method: ctx.method,
      path: ctx.path,
      clientMessage: ctx.message,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    };

    if (exception instanceof BusinessException) {
      this.logger.warn('业务异常', {
        ...payload,
        action: 'exception.business',
        context: exception.context,
      });
      return;
    }

    if (exception instanceof HttpException && ctx.status < 500) {
      this.logger.warn('HTTP 异常', payload);
      return;
    }

    if (exception instanceof Error && exception.name === 'PayloadTooLargeError') {
      this.logger.warn('请求体过大', { ...payload, action: 'exception.payload_too_large' });
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error('未捕获异常', {
      ...payload,
      action: 'exception.unhandled',
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack,
    });
  }
}
