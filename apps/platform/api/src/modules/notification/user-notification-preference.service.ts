/**
 * 用户通知偏好：邮件开关与类型静音。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

export interface NotificationPreferenceDto {
  emailEnabled: boolean;
  mutedTypes: string[];
}

@Injectable()
export class UserNotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, organizationId: string): Promise<NotificationPreferenceDto> {
    const pref = await this.prisma.userNotificationPreference.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return {
      emailEnabled: pref?.emailEnabled ?? true,
      mutedTypes: pref?.mutedTypes ?? [],
    };
  }

  async update(
    userId: string,
    organizationId: string,
    input: Partial<NotificationPreferenceDto>,
  ): Promise<NotificationPreferenceDto> {
    const pref = await this.prisma.userNotificationPreference.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: {
        userId,
        organizationId,
        emailEnabled: input.emailEnabled ?? true,
        mutedTypes: input.mutedTypes ?? [],
      },
      update: {
        emailEnabled: input.emailEnabled,
        mutedTypes: input.mutedTypes,
      },
    });
    return {
      emailEnabled: pref.emailEnabled,
      mutedTypes: pref.mutedTypes,
    };
  }

  /** 过滤掉已关闭邮件或静音该类型的收件人邮箱 */
  async filterEmailableRecipients(
    organizationId: string,
    emails: string[],
    notificationType: string,
  ): Promise<string[]> {
    if (emails.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { organizationId, email: { in: emails }, status: 'ACTIVE' },
      select: { id: true, email: true },
    });
    if (users.length === 0) return [];

    const prefs = await this.prisma.userNotificationPreference.findMany({
      where: {
        organizationId,
        userId: { in: users.map((u) => u.id) },
      },
    });
    const prefByUserId = new Map(prefs.map((p) => [p.userId, p]));

    return users
      .filter((u) => {
        const pref = prefByUserId.get(u.id);
        if (pref && !pref.emailEnabled) return false;
        if (pref?.mutedTypes.includes(notificationType)) return false;
        return true;
      })
      .map((u) => u.email)
      .filter(Boolean);
  }
}
