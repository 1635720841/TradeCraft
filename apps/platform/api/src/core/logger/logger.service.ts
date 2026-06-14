/**
 * 结构化日志服务：封装 pino/winston（MVP 用 console 结构化输出）。
 *
 * 边界：
 * - 不负责：业务逻辑
 *
 * 入口：
 * - LoggerService
 */

import { Injectable } from '@nestjs/common';
import type { ILogger, LogPayload } from '@wm/shared-core';

@Injectable()
export class LoggerService implements ILogger {
  info(message: string, payload?: LogPayload): void {
    console.info(JSON.stringify({ level: 'info', message, ...payload }));
  }

  warn(message: string, payload?: LogPayload): void {
    console.warn(JSON.stringify({ level: 'warn', message, ...payload }));
  }

  error(message: string, payload?: LogPayload): void {
    console.error(JSON.stringify({ level: 'error', message, ...payload }));
  }

  debug(message: string, payload?: LogPayload): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({ level: 'debug', message, ...payload }));
    }
  }
}
