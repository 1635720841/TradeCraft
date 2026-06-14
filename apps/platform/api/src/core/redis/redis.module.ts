/**
 * Redis 模块：全局导出 RedisService。
 *
 * 边界：
 * - 不负责：队列注册（由 QueueModule 处理）
 *
 * 入口：
 * - RedisModule
 */

import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
