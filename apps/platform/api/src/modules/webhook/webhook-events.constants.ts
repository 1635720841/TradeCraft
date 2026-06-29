/**
 * 出站 Webhook 可订阅事件白名单。
 */

export const WEBHOOK_EVENT_ALLOWLIST = [
  'article.completed',
  'article.failed',
  'article.brief_pending',
  'article.assigned',
  'article.comment_added',
  'org.quota_low',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENT_ALLOWLIST)[number];

export function assertWebhookEvents(events: string[]): string[] {
  const invalid = events.filter((e) => !WEBHOOK_EVENT_ALLOWLIST.includes(e as WebhookEvent));
  if (invalid.length > 0) {
    throw new Error(`不支持的事件类型：${invalid.join(', ')}`);
  }
  return events;
}
