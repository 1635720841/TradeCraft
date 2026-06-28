/**
 * 套餐能力门控：按 planName 决定功能上限。
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { PrismaService } from '../../core/database/prisma.service';

import {
  type PlanEntitlements,
  resolvePlanEntitlements,
} from './plan-entitlements.constants';

export type { PlanEntitlements };

export type EntitlementKey = keyof PlanEntitlements;

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForOrganization(organizationId: string): Promise<PlanEntitlements & { planName: string }> {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { planName: true },
    });
    const planName = org?.planName ?? 'trial';
    const entitlements = resolvePlanEntitlements(planName);
    return { ...entitlements, planName };
  }

  async assertEntitlement(organizationId: string, key: EntitlementKey) {
    const ent = await this.getForOrganization(organizationId);
    const value = ent[key];
    if (typeof value === 'boolean' && !value) {
      throw new BusinessException(
        ErrorCodes.FORBIDDEN,
        `当前套餐（${ent.planName}）不支持此功能，请升级套餐`,
      );
    }
    return ent;
  }

  async assertProjectLimit(organizationId: string) {
    const ent = await this.getForOrganization(organizationId);
    const count = await this.prisma.project.count({
      where: { organizationId, status: 'ACTIVE' },
    });
    if (count >= ent.maxProjects) {
      throw new BusinessException(
        ErrorCodes.FORBIDDEN,
        `当前套餐最多创建 ${ent.maxProjects} 个项目`,
      );
    }
  }

  getMaxConcurrentJobs(planName: string): number {
    return resolvePlanEntitlements(planName).maxConcurrentJobs;
  }
}
