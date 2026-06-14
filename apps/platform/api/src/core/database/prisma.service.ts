/**
 * Prisma 客户端封装：全局数据库访问入口。
 *
 * 边界：
 * - 不负责：业务查询逻辑（由各 Service 编写）
 *
 * 入口：
 * - PrismaService
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
