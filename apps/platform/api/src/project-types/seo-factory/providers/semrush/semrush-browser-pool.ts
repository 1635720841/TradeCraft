/**
 * Semrush Playwright 浏览器池：复用 Chromium 实例，进程退出时统一释放。
 *
 * 边界：
 * - 不负责：SWA 查分（SemrushRpaAdapter）
 *
 * 入口：
 * - SemrushBrowserPool
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';
import { LoggerService } from '../../../../core/logger/logger.service';
import {
  getSemrushBrowserLaunchOptions,
  readSemrushBrowserPoolSize,
} from './semrush-browser.util';

const activeBrowsers = new Set<Browser>();

function registerBrowserShutdownHooks(): void {
  if ((registerBrowserShutdownHooks as { registered?: boolean }).registered) return;
  (registerBrowserShutdownHooks as { registered?: boolean }).registered = true;

  const closeAll = () => {
    void Promise.all([...activeBrowsers].map((browser) => browser.close().catch(() => undefined)));
  };

  process.once('SIGINT', closeAll);
  process.once('SIGTERM', closeAll);
  process.once('exit', closeAll);
}

registerBrowserShutdownHooks();

@Injectable()
export class SemrushBrowserPool implements OnModuleDestroy {
  private readonly maxSize = readSemrushBrowserPoolSize();
  private readonly idle: Browser[] = [];
  private readonly inUse = new Set<Browser>();
  private closing = false;

  constructor(private readonly logger: LoggerService) {}

  async borrow(): Promise<Browser> {
    if (this.closing) {
      throw new Error('Semrush 浏览器池已关闭');
    }

    while (this.idle.length > 0) {
      const browser = this.idle.pop()!;
      if (browser.isConnected()) {
        this.inUse.add(browser);
        return browser;
      }
      activeBrowsers.delete(browser);
      await browser.close().catch(() => undefined);
    }

    if (this.inUse.size + this.idle.length < this.maxSize) {
      const browser = await this.launchBrowser();
      this.inUse.add(browser);
      return browser;
    }

    return this.waitForIdleBrowser();
  }

  async release(browser: Browser): Promise<void> {
    this.inUse.delete(browser);

    if (this.closing || !browser.isConnected()) {
      activeBrowsers.delete(browser);
      await browser.close().catch(() => undefined);
      return;
    }

    this.idle.push(browser);
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    const all = [...this.idle, ...this.inUse];
    this.idle.length = 0;
    this.inUse.clear();

    await Promise.all(
      all.map(async (browser) => {
        activeBrowsers.delete(browser);
        await browser.close().catch(() => undefined);
      }),
    );
  }

  private async waitForIdleBrowser(): Promise<Browser> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (this.idle.length > 0) {
        return this.borrow();
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Semrush 浏览器池等待超时');
  }

  private async launchBrowser(): Promise<Browser> {
    const launchOptions = getSemrushBrowserLaunchOptions();

    try {
      const browser = await chromium.launch(launchOptions);
      activeBrowsers.add(browser);
      this.logger.info('Semrush browser launched', {
        action: 'semrush.browser_launch',
        poolSize: this.maxSize,
        headless: launchOptions.headless !== false,
      });
      return browser;
    } catch (err) {
      if (launchOptions.channel) {
        this.logger.warn('System browser launch failed, falling back to bundled Chromium', {
          action: 'semrush.browser_fallback',
          channel: launchOptions.channel,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        const { channel: _channel, ...fallback } = launchOptions;
        const browser = await chromium.launch(fallback);
        activeBrowsers.add(browser);
        return browser;
      }
      throw err;
    }
  }
}
