/**
 * Webhook 配置 CRUD。
 */

import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';

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
    return this.prisma.orgWebhook.create({
      data: {
        organizationId,
        url: input.url.trim(),
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

    return this.prisma.orgWebhook.update({
      where: { id: webhookId },
      data: {
        url: input.url?.trim(),
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
}
