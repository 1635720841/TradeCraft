/**
 * 站点服务：查询项目下站点列表（供任务创建选择站点）。
 *
 * 边界：
 * - 不负责：站点 CRUD 完整实现（P3 扩展）
 *
 * 入口：
 * - SiteService
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';

@Injectable()
export class SiteService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(organizationId: string, projectId: string) {

    return this.prisma.site.findMany({
      where: { organizationId, projectId },
      select: {
        id: true,
        domain: true,
        brandVoice: true,
        targetMarket: true,
        contentLanguage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
