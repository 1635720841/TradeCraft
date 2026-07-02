/**
 * seo-factory 计费计量 Port 实现。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BillingMeterPort } from '@wm/platform-sdk';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { registerBillingMeterPort } from '../../../../core/billing/billing-meter.registry';

const ARTICLE_METER_ID = 'article.completed';

@Injectable()
export class SeoFactoryBillingMeterService implements BillingMeterPort, OnModuleInit {
  readonly projectType = 'seo-factory';

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    registerBillingMeterPort(this);
  }

  meters() {
    return [{ id: ARTICLE_METER_ID, label: '完成文章' }];
  }

  async countInFlightUsage(organizationId: string, meterId: string): Promise<number> {
    if (meterId !== ARTICLE_METER_ID) return 0;
    const grouped = await this.prisma.articleJob.groupBy({
      by: ['status'],
      where: {
        organizationId,
        status: { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] },
      },
      _count: { _all: true },
    });
    return grouped.reduce((sum, row) => sum + row._count._all, 0);
  }
}
