/**
 * Semrush Playwright 启动参数（SessionManager 与 BrowserPool 共用）。
 */

import type { LaunchOptions } from 'playwright';
import { SEMRUSH_BROWSER_CHANNEL } from './semrush.constants';

export function getSemrushProxyConfig() {
  const server = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  return server ? { server } : undefined;
}

export function getSemrushBrowserLaunchOptions(): LaunchOptions {
  const headless = process.env.SEMRUSH_HEADLESS !== 'false';
  const channel = SEMRUSH_BROWSER_CHANNEL;

  const options: LaunchOptions = {
    headless,
    proxy: getSemrushProxyConfig(),
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  };

  if (channel === 'chrome' || channel === 'msedge') {
    options.channel = channel;
  }

  return options;
}

export function readSemrushBrowserPoolSize(): number {
  const parsed = Number.parseInt(process.env.SEMRUSH_BROWSER_POOL_SIZE ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
