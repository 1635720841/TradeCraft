/**
 * 钉钉/飞书机器人通道 CRUD。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { assertSafeWebhookUrl } from '../webhook/webhook-url-guard.util';

const ROBOT_CHANNEL_TYPES = ['dingtalk', 'feishu'] as const;
const ROBOT_EVENT_TYPES = ['brief_pending', 'job_failed', 'assigned', 'quota_low'] as const;

@Injectable()
export class OrgRobotChannelService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.orgRobotChannel.findMany({
      where: { organizationId },
      select: {
        id: true,
        channelType: true,
        webhookUrl: true,
        isActive: true,
        events: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    organizationId: string,
    input: { channelType: string; webhookUrl: string; events: string[] },
  ) {
    this.assertChannelType(input.channelType);
    this.assertEvents(input.events);
    const webhookUrl = assertSafeWebhookUrl(input.webhookUrl);

    return this.prisma.orgRobotChannel.create({
      data: {
        organizationId,
        channelType: input.channelType,
        webhookUrl,
        events: input.events,
      },
      select: {
        id: true,
        channelType: true,
        webhookUrl: true,
        isActive: true,
        events: true,
        createdAt: true,
      },
    });
  }

  async update(
    organizationId: string,
    channelId: string,
    input: { channelType?: string; webhookUrl?: string; events?: string[]; isActive?: boolean },
  ) {
    const channel = await this.prisma.orgRobotChannel.findFirst({
      where: { id: channelId, organizationId },
    });
    if (!channel) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '机器人通道不存在');
    }

    if (input.channelType) this.assertChannelType(input.channelType);
    if (input.events) this.assertEvents(input.events);

    return this.prisma.orgRobotChannel.update({
      where: { id: channelId },
      data: {
        channelType: input.channelType,
        webhookUrl: input.webhookUrl ? assertSafeWebhookUrl(input.webhookUrl) : undefined,
        events: input.events,
        isActive: input.isActive,
      },
      select: {
        id: true,
        channelType: true,
        webhookUrl: true,
        isActive: true,
        events: true,
        updatedAt: true,
      },
    });
  }

  async remove(organizationId: string, channelId: string) {
    const channel = await this.prisma.orgRobotChannel.findFirst({
      where: { id: channelId, organizationId },
    });
    if (!channel) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '机器人通道不存在');
    }
    await this.prisma.orgRobotChannel.delete({ where: { id: channelId } });
    return { ok: true };
  }

  private assertChannelType(type: string): void {
    if (!ROBOT_CHANNEL_TYPES.includes(type as (typeof ROBOT_CHANNEL_TYPES)[number])) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '通道类型必须是 dingtalk 或 feishu');
    }
  }

  private assertEvents(events: string[]): void {
    const invalid = events.filter(
      (e) => !ROBOT_EVENT_TYPES.includes(e as (typeof ROBOT_EVENT_TYPES)[number]),
    );
    if (invalid.length > 0 || events.length === 0) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请选择有效的事件类型');
    }
  }
}
