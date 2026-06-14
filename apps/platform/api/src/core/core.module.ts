/**
 * 核心基建模块：数据库、日志、异常、全局 Provider。
 *
 * 边界：
 * - 不负责：业务逻辑
 *
 * 入口：
 * - CoreModule
 */

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { LoggerService } from './logger/logger.service';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './exceptions/global-exception.filter';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

@Global()
@Module({
  imports: [RedisModule, QueueModule, StorageModule],
  providers: [
    PrismaService,
    LoggerService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [PrismaService, LoggerService],
})
export class CoreModule {}
