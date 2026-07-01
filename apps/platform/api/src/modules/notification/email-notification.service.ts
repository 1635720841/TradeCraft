/**
 * 邮件通知：SMTP 未配置时仅写日志，不阻断主流程。
 *
 * 边界：
 * - 不负责：站内消息、WebSocket 推送
 *
 * 入口：
 * - EmailNotificationService
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../core/logger/logger.service';
import { UserNotificationPreferenceService } from './user-notification-preference.service';

export interface SendEmailInput {
  to: string[];
  subject: string;
  text: string;
  organizationId?: string;
  notificationType?: string;
}

@Injectable()
export class EmailNotificationService {
  constructor(
    private readonly logger: LoggerService,
    private readonly preferences: UserNotificationPreferenceService,
  ) {}

  async send(input: SendEmailInput): Promise<void> {
    let recipients = [...new Set(input.to.filter(Boolean))];
    if (recipients.length === 0) {
      return;
    }

    if (input.organizationId && input.notificationType) {
      recipients = await this.preferences.filterEmailableRecipients(
        input.organizationId,
        recipients,
        input.notificationType,
      );
      if (recipients.length === 0) {
        return;
      }
    }

    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      const nodeEnv = process.env.NODE_ENV ?? 'development';
      const action = nodeEnv === 'production' ? 'notification.email.misconfigured' : 'notification.email.skipped';
      const logFn = nodeEnv === 'production' ? this.logger.warn.bind(this.logger) : this.logger.info.bind(this.logger);
      logFn('Notification email skipped (SMTP_HOST unset)', {
        action,
        subject: input.subject,
        recipientCount: recipients.length,
      });
      return;
    }

    try {
      const nodemailer = await import('nodemailer');
      const port = Number(process.env.SMTP_PORT ?? 587);
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
      });

      const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@wm.local';
      await transporter.sendMail({
        from,
        to: recipients.join(','),
        subject: input.subject,
        text: input.text,
      });

      this.logger.info('Notification email sent', {
        action: 'notification.email.sent',
        subject: input.subject,
        recipientCount: recipients.length,
      });
    } catch (err) {
      this.logger.warn('Notification email failed', {
        action: 'notification.email.failed',
        subject: input.subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
