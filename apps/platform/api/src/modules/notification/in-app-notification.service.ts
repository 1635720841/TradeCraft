/**
 * 站内通知：持久化、列表、已读。
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export interface CreateNotificationInput {
  organizationId: string;
  userIds: string[];
  type: string;
  title: string;
  body?: string;
  linkPath?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class InAppNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUsers(input: CreateNotificationInput) {
    if (input.userIds.length === 0) {
      return [];
    }

    return this.prisma.userNotification.createMany({
      data: input.userIds.map((userId) => ({
        organizationId: input.organizationId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        linkPath: input.linkPath,
        payload: input.payload as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  async list(userId: string, organizationId: string, limit = 30, unreadOnly = false) {
    return this.prisma.userNotification.findMany({
      where: {
        userId,
        organizationId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async unreadCount(userId: string, organizationId: string) {
    return this.prisma.userNotification.count({
      where: { userId, organizationId, readAt: null },
    });
  }

  async markRead(userId: string, organizationId: string, notificationId: string) {
    await this.prisma.userNotification.updateMany({
      where: { id: notificationId, userId, organizationId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string, organizationId: string) {
    await this.prisma.userNotification.updateMany({
      where: { userId, organizationId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
