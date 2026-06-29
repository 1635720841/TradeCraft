/**
 * 将副作用推迟到当前事件循环之后，避免在 Prisma 事务提交前被监听器读到未提交数据。
 */

export function runAfterCommit(fn: () => void | Promise<void>): void {
  setImmediate(() => {
    void Promise.resolve(fn()).catch(() => {
      /* 监听器自行记录错误，此处不向上抛 */
    });
  });
}
