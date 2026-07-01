/**
 * Prisma 客户端封装：全局数据库访问入口（含租户隔离扩展）。
 *
 * 边界：
 * - 不负责：业务查询逻辑（由各 Service 编写）
 *
 * 入口：
 * - PrismaService
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantIsolationExtension } from '../prisma/prisma-tenant.extension';
import { softDeleteExtension } from '../prisma/prisma-soft-delete.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    const extended = this.$extends(softDeleteExtension).$extends(tenantIsolationExtension);

    return new Proxy(extended, {
      get(target, prop, receiver) {
        if (prop === 'onModuleInit') {
          return async () => {
            await target.$connect();
          };
        }
        if (prop === 'onModuleDestroy') {
          return async () => {
            await target.$disconnect();
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
