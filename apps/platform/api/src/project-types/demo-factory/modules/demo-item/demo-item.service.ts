/**
 * demo-factory 演示项只读列表。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';

@Injectable()
export class DemoItemService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, projectId: string) {
    return this.prisma.demoItem.findMany({
      where: { organizationId, projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, createdAt: true },
    });
  }

  async ensureSeed(organizationId: string, projectId: string) {
    const count = await this.prisma.demoItem.count({
      where: { organizationId, projectId },
    });
    if (count > 0) return;
    await this.prisma.demoItem.create({
      data: {
        organizationId,
        projectId,
        title: '演示插件已就绪',
      },
    });
  }
}
