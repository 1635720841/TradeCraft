/**
 * 通知邮件中的可点击工作台链接。
 */

export function buildNotificationAppLink(linkPath: string): string | null {
  const origin = process.env.WEB_APP_ORIGIN?.trim().replace(/\/$/, '');
  if (!origin || !linkPath) {
    return null;
  }
  const path = linkPath.startsWith('/') ? linkPath : `/${linkPath}`;
  return `${origin}${path}`;
}

export function appendNotificationLink(textLines: string[], linkPath: string): string {
  const url = buildNotificationAppLink(linkPath);
  if (!url) {
    return textLines.join('\n');
  }
  return [...textLines, '', `打开链接：${url}`].join('\n');
}
