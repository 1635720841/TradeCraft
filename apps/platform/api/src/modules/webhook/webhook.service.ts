/**
 * Webhook 配置 CRUD。
 */

import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { AuditService } from '../access/audit.service';
import { WEBHOOK_EVENT_ALLOWLIST } from './webhook-events.constants';
import { assertSafeWebhookUrl } from './webhook-url-guard.util';

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(organizationId: string, options?: { page?: number; limit?: number }) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));

    const where = { organizationId };
    const [total, items] = await Promise.all([
      this.prisma.orgWebhook.count({ where }),
      this.prisma.orgWebhook.findMany({
        where,
        select: {
          id: true,
          url: true,
          events: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, page, limit, total };
  }

  async create(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    input: { url: string; events: string[] },
  ) {
    this.assertEvents(input.events);
    const url = assertSafeWebhookUrl(input.url);

    const row = await this.prisma.orgWebhook.create({
      data: {
        organizationId,
        url,
        events: input.events,
        secret: randomBytes(32).toString('hex'),
      },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        secret: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.webhook.create',
      targetType: 'OrgWebhook',
      targetId: row.id,
      traceId,
    });

    return row;
  }

  async update(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    webhookId: string,
    input: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    const hook = await this.prisma.orgWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });
    if (!hook) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, 'Webhook 不存在');
    }

    if (input.events) this.assertEvents(input.events);

    const row = await this.prisma.orgWebhook.update({
      where: { id: webhookId },
      data: {
        url: input.url ? assertSafeWebhookUrl(input.url) : undefined,
        events: input.events,
        isActive: input.isActive,
      },
      select: { id: true, url: true, events: true, isActive: true, updatedAt: true },
    });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.webhook.update',
      targetType: 'OrgWebhook',
      targetId: webhookId,
      metadata: { fields: Object.keys(input) },
      traceId,
    });

    return row;
  }

  async remove(organizationId: string, actorUserId: string, traceId: string, webhookId: string) {
    const hook = await this.prisma.orgWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });
    if (!hook) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, 'Webhook 不存在');
    }

    await this.prisma.orgWebhook.delete({ where: { id: webhookId } });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.webhook.delete',
      targetType: 'OrgWebhook',
      targetId: webhookId,
      traceId,
    });

    return { deleted: true };
  }

  async listDeliveries(
    organizationId: string,
    webhookId: string,
    page = 1,
    limit = 20,
  ) {
    const hook = await this.prisma.orgWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });
    if (!hook) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, 'Webhook 不存在');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.webhookDeliveryLog.findMany({
        where: { organizationId, webhookId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.webhookDeliveryLog.count({ where: { organizationId, webhookId } }),
    ]);

    return { items, total, page: Math.max(page, 1), limit: safeLimit };
  }

  private assertEvents(events: string[]): void {
    const invalid = events.filter(
      (e) => !WEBHOOK_EVENT_ALLOWLIST.includes(e as (typeof WEBHOOK_EVENT_ALLOWLIST)[number]),
    );
    if (invalid.length > 0 || events.length === 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请选择有效的 Webhook 事件类型');
    }
  }
}
