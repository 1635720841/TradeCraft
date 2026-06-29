/**
 * Webhook 配置 CRUD。
 */

import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { WEBHOOK_EVENT_ALLOWLIST } from './webhook-events.constants';
import { assertSafeWebhookUrl } from './webhook-url-guard.util';

@Injectable()
export class WebhookService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.orgWebhook.findMany({
      where: { organizationId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    organizationId: string,
    input: { url: string; events: string[] },
  ) {
    this.assertEvents(input.events);
    const url = assertSafeWebhookUrl(input.url);

    return this.prisma.orgWebhook.create({
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
  }

  async update(
    organizationId: string,
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

    return this.prisma.orgWebhook.update({
      where: { id: webhookId },
      data: {
        url: input.url ? assertSafeWebhookUrl(input.url) : undefined,
        events: input.events,
        isActive: input.isActive,
      },
      select: { id: true, url: true, events: true, isActive: true, updatedAt: true },
    });
  }

  async remove(organizationId: string, webhookId: string) {
    const hook = await this.prisma.orgWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });
    if (!hook) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, 'Webhook 不存在');
    }
    await this.prisma.orgWebhook.delete({ where: { id: webhookId } });
    return { ok: true };
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
