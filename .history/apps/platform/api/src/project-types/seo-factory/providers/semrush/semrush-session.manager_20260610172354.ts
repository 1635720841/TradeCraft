/**
 * 3ue Tools Share → Semrush 会话管理：登录、Cookie 持久化、打开 Semrush。
 *
 * 边界：
 * - 不负责：SWA 查分逻辑（SemrushRpaAdapter）
 *
 * 入口：
 * - SemrushSessionManager
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { mkdir, access, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import { LoggerService } from '../../../../core/logger/logger.service';
import { TOOLS_SHARE_HOME_URL, TOOLS_SHARE_LOGIN_URL } from './semrush.constants';
import { TOOLS_SHARE_SELECTORS } from './semrush.selectors';

const SESSION_DIR = join(process.cwd(), '.semrush-session');
const STORAGE_STATE_PATH = join(SESSION_DIR, 'storage-state.json');
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

function getProxyConfig() {
  const server = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  return server ? { server } : undefined;
}

function maskUsername(username: string): string {
  if (username.length <= 2) return '**';
  return `${username.slice(0, 2)}***`;
}

/** Markdown 转纯文本，便于粘贴进 Semrush 编辑器 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^-\s+/gm, '• ')
    .trim();
}

@Injectable()
export class SemrushSessionManager implements OnModuleDestroy {
  constructor(private readonly logger: LoggerService) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...activeBrowsers].map((browser) => browser.close().catch(() => undefined)));
    activeBrowsers.clear();
  }

  async withBrowser<T>(fn: (context: BrowserContext) => Promise<T>): Promise<T> {
    const headless = process.env.SEMRUSH_HEADLESS !== 'false';
    const browser = await chromium.launch({
      headless,
      proxy: getProxyConfig(),
    });
    activeBrowsers.add(browser);

    try {
      const context = await this.createContext(browser);
      return await fn(context);
    } finally {
      activeBrowsers.delete(browser);
      await browser.close().catch(() => undefined);
    }
  }

  async openSemrushEditor(context: BrowserContext): Promise<Page> {
    const dashPage = await context.newPage();
    await this.ensureToolsShareLogin(dashPage);
    const semrushPage = await this.openSemrushFromDashboard(dashPage, context);
    await dashPage.close().catch(() => undefined);
    return semrushPage;
  }

  private async createContext(browser: Browser): Promise<BrowserContext> {
    const hasState = await this.hasStorageState();
    return browser.newContext(
      hasState
        ? { storageState: STORAGE_STATE_PATH, viewport: { width: 1440, height: 900 } }
        : { viewport: { width: 1440, height: 900 } },
    );
  }

  private async hasStorageState(): Promise<boolean> {
    try {
      await access(STORAGE_STATE_PATH, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureToolsShareLogin(page: Page): Promise<void> {
    await page.goto(TOOLS_SHARE_HOME_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    if (!(await this.isToolsShareLoggedIn(page))) {
      await this.loginToolsShare(page);
    }

    await page.locator(TOOLS_SHARE_SELECTORS.openSemrush).first().waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** SPA 在 domcontentloaded 时 hash 可能仍为 home，需等路由落定后再判断 */
  private async isToolsShareLoggedIn(page: Page): Promise<boolean> {
    await Promise.race([
      page.locator(TOOLS_SHARE_SELECTORS.openSemrush).first().waitFor({ state: 'visible', timeout: 30_000 }),
      page.locator(TOOLS_SHARE_SELECTORS.username).waitFor({ state: 'visible', timeout: 30_000 }),
    ]).catch(() => undefined);

    return (await page.locator(TOOLS_SHARE_SELECTORS.openSemrush).count()) > 0;
  }

  /** Nebular 表单需触发 input 事件，否则登录按钮保持 disabled */
  private async fillAngularInput(input: Locator, value: string): Promise<void> {
    await input.waitFor({ state: 'visible', timeout: 20_000 });
    await input.click();
    await input.fill(value);
    await input.dispatchEvent('input');
    await input.dispatchEvent('change');
  }

  private async waitLoginButtonEnabled(page: Page): Promise<void> {
    await page
      .locator(`${TOOLS_SHARE_SELECTORS.loginButton}:not([disabled])`)
      .waitFor({ state: 'visible', timeout: 20_000 });
  }

  private async loginToolsShare(page: Page): Promise<void> {
    const username = process.env.SEMRUSH_3UE_USERNAME;
    const password = process.env.SEMRUSH_3UE_PASSWORD;

    if (!username || !password) {
      throw new Error('SEMRUSH_3UE_USERNAME / SEMRUSH_3UE_PASSWORD 未配置');
    }

    try {
      await page.goto(TOOLS_SHARE_LOGIN_URL, { waitUntil: 'networkidle', timeout: 60_000 });

      await this.fillAngularInput(page.locator(TOOLS_SHARE_SELECTORS.username), username);
      await this.fillAngularInput(page.locator(TOOLS_SHARE_SELECTORS.password), password);
      await this.waitLoginButtonEnabled(page);

      await page.locator(TOOLS_SHARE_SELECTORS.loginButton).click();
      await page.locator(TOOLS_SHARE_SELECTORS.openSemrush).first().waitFor({ state: 'visible', timeout: 60_000 });

      await mkdir(SESSION_DIR, { recursive: true });
      await page.context().storageState({ path: STORAGE_STATE_PATH });

      this.logger.info('Tools Share login succeeded', {
        action: 'semrush.login',
        username: maskUsername(username),
      });
    } catch (err) {
      await unlink(STORAGE_STATE_PATH).catch(() => undefined);
      throw err;
    }
  }

  private async openSemrushFromDashboard(dashPage: Page, context: BrowserContext): Promise<Page> {
    await dashPage.goto(TOOLS_SHARE_HOME_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    const target = dashPage.locator(TOOLS_SHARE_SELECTORS.openSemrush).first();
    await target.waitFor({ state: 'visible', timeout: 30_000 });

    const popupPromise = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);
    await target.click();

    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 });
      await popup.waitForURL(/sem\.3ue\.com/, { timeout: 60_000 });
      return popup;
    }

    await dashPage.waitForURL(/sem\.3ue\.com/, { timeout: 60_000 });
    return dashPage;
  }
}
