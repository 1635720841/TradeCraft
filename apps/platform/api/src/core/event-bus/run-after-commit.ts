/**
 * 将副作用推迟到当前事件循环之后，避免在 Prisma 事务提交前被监听器读到未提交数据。
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('RunAfterCommit');

export function runAfterCommit(fn: () => void | Promise<void>): void {
  setImmediate(() => {
    void Promise.resolve(fn()).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Async listener failed: ${message}`, error instanceof Error ? error.stack : undefined);
    });
  });
}
