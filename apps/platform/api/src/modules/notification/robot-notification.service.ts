/**
 * 钉钉/飞书机器人通知：格式化消息并投递到 Webhook。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { buildNotificationAppLink } from './notification-link.util';

export type RobotEventType = 'brief_pending' | 'job_failed' | 'assigned' | 'quota_low';

export interface RobotNotifyInput {
  organizationId: string;
  eventType: RobotEventType;
  title: string;
  body?: string;
  linkPath?: string;
}

@Injectable()
export class RobotNotificationService {
  private readonly logger = new Logger(RobotNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(input: RobotNotifyInput): Promise<void> {
    const channels = await this.prisma.orgRobotChannel.findMany({
      where: {
        organizationId: input.organizationId,
        isActive: true,
        events: { has: input.eventType },
      },
    });

    for (const channel of channels) {
      const payload = this.formatPayload(channel.channelType, input);
      await this.deliver(channel.webhookUrl, payload, channel.channelType);
    }
  }

  private formatPayload(
    channelType: string,
    input: RobotNotifyInput,
  ): Record<string, unknown> {
    const link = input.linkPath ? buildNotificationAppLink(input.linkPath) : null;
    const lines = [input.title];
    if (input.body) lines.push(input.body);
    if (link) lines.push(`[打开链接](${link})`);
    const text = lines.join('\n\n');

    if (channelType === 'feishu') {
      return {
        msg_type: 'text',
        content: { text },
      };
    }

    return {
      msgtype: 'markdown',
      markdown: { title: input.title, text },
    };
  }

  private async deliver(
    webhookUrl: string,
    payload: Record<string, unknown>,
    channelType: string,
  ): Promise<void> {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => 'HTTP error');
        this.logger.warn(`Robot ${channelType} delivery failed: ${res.status} ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Robot ${channelType} delivery error: ${message}`);
    }
  }
}
