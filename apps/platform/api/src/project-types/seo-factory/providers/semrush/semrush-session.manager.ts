/**
 * 3ue Tools Share → Semrush 会话管理：登录、Cookie 持久化、打开 Semrush。
 *
 * 边界：
 * - 不负责：SWA 查分逻辑（SemrushRpaAdapter）
 *
 * 入口：
 * - SemrushSessionManager
 */

import { Injectable } from '@nestjs/common';
import { mkdir, access, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';
import { LoggerService } from '../../../../core/logger/logger.service';
import { SemrushBrowserPool } from './semrush-browser-pool';
import {
  SEMRUSH_CACHE_CLEAN_MAX_MS,
  SEMRUSH_CACHE_CLEAN_PATTERN,
  SEMRUSH_NODE_ATTEMPT_TIMEOUT_MS,
  SEMRUSH_NODE_MAX_ATTEMPTS,
  SEMRUSH_SWA_EDITOR_TIMEOUT_MS,
  SEMRUSH_SWA_PATH,
  SEMRUSH_UI_SETTLE_MS,
  TOOLS_SHARE_HOME_URL,
  TOOLS_SHARE_LOGIN_URL,
} from './semrush.constants';
import { waitForAnyLocator, sleep } from './semrush-page-wait';
import { SEMRUSH_SWA_SELECTORS, TOOLS_SHARE_SELECTORS } from './semrush.selectors';

const SESSION_DIR = join(process.cwd(), '.semrush-session');
const STORAGE_STATE_PATH = join(SESSION_DIR, 'storage-state.json');

function maskUsername(username: string): string {
  if (username.length <= 2) return '**';
  return `${username.slice(0, 2)}***`;
}

export interface SemrushEditorSession {
  page: Page;
  nodeKey: string;
  nodeLabel: string;
}

export interface OpenSemrushEditorOptions {
  /** 优先固定的节点键（如「节点14」） */
  preferredNodeKey?: string;
}

@Injectable()
export class SemrushSessionManager {
  constructor(
    private readonly logger: LoggerService,
    private readonly browserPool: SemrushBrowserPool,
  ) {}

  async withBrowser<T>(fn: (context: BrowserContext) => Promise<T>): Promise<T> {
    const browser = await this.browserPool.borrow();
    let context: BrowserContext | null = null;

    try {
      context = await this.createContext(browser);
      return await fn(context);
    } finally {
      await context?.close().catch(() => undefined);
      await this.browserPool.release(browser);
    }
  }

  async openSemrushEditor(
    context: BrowserContext,
    options?: OpenSemrushEditorOptions,
  ): Promise<SemrushEditorSession> {
    const dashPage = await context.newPage();
    await this.ensureToolsShareLogin(dashPage);
    const opened = await this.openSemrushFromDashboard(dashPage, context, options);
    await this.navigateToSwaChecker(opened.page);
    await dashPage.close().catch(() => undefined);
    return opened;
  }

  /**
   * 进入 SWA checker 编辑页（可重复调用）。
   * 入口不固定：可能已在编辑页、需点「分析新文本」、或直接访问 /swa/checker/。
   */
  async navigateToSwaChecker(page: Page): Promise<void> {
    await page.bringToFront().catch(() => undefined);

    if (await this.isSwaCheckerReady(page)) {
      await this.finalizeCheckerReady(page);
      return;
    }

    this.logger.info('Entering SEO Writing Assistant', {
      action: 'semrush.swa_nav_start',
      url: page.url(),
    });

    if (await this.tryGotoCheckerDirect(page)) {
      await this.finalizeCheckerReady(page);
      return;
    }

    if (!page.url().includes('/swa/')) {
      const swaUrl = new URL(page.url());
      swaUrl.pathname = SEMRUSH_SWA_PATH;
      await page.goto(swaUrl.toString(), { waitUntil: 'commit', timeout: 60_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => undefined);
    }

    const listDeadline = Date.now() + 45_000;
    while (Date.now() < listDeadline) {
      if (await this.isSwaCheckerReady(page)) break;
      if ((await page.locator(SEMRUSH_SWA_SELECTORS.newAnalysis).count()) > 0) break;
      if ((await page.locator(SEMRUSH_SWA_SELECTORS.newDocument).count()) > 0) break;

      const title = await page.title().catch(() => '');
      if (/SEO Writing|写作助手|写作工具/i.test(title) && (await this.getBodyHtmlLength(page)) > 1000) {
        await page.waitForTimeout(2_000);
        if (await this.isSwaCheckerReady(page)) break;
        if ((await page.locator(SEMRUSH_SWA_SELECTORS.newAnalysis).count()) > 0) break;
      }
      await page.waitForTimeout(1_500);
    }

    if (!(await this.isSwaCheckerReady(page))) {
      const entered = await this.tryClickCheckerEntry(page);
      if (!entered && !(await this.tryGotoCheckerDirect(page))) {
        throw new Error('无法进入 SEO 写作助手 checker 页（未找到可用入口）');
      }
    }

    await this.finalizeCheckerReady(page);
  }

  /** 以 UI 为准判断 checker 是否可用（URL 可能仍为 /swa/） */
  async isSwaCheckerReady(page: Page): Promise<boolean> {
    const editorVisible = await page
      .locator(SEMRUSH_SWA_SELECTORS.editor)
      .first()
      .isVisible()
      .catch(() => false);
    if (editorVisible) return true;

    const widgetVisible = await page
      .locator(SEMRUSH_SWA_SELECTORS.checkerWidget)
      .first()
      .isVisible()
      .catch(() => false);
    if (widgetVisible) return true;

    const panelVisible = await page
      .locator(SEMRUSH_SWA_SELECTORS.contentPanel)
      .first()
      .isVisible()
      .catch(() => false);
    const goalsVisible = await page
      .locator(SEMRUSH_SWA_SELECTORS.setNewGoals)
      .first()
      .isVisible()
      .catch(() => false);
    const keywordVisible = await page
      .locator(SEMRUSH_SWA_SELECTORS.keywordInput)
      .first()
      .isVisible()
      .catch(() => false);

    return panelVisible && (goalsVisible || keywordVisible);
  }

  private async finalizeCheckerReady(page: Page): Promise<void> {
    await waitForAnyLocator(
      page,
      (p) => p.locator(SEMRUSH_SWA_SELECTORS.editor),
      { timeoutMs: SEMRUSH_SWA_EDITOR_TIMEOUT_MS, label: 'SWA 编辑器' },
    );
    await sleep(SEMRUSH_UI_SETTLE_MS);

    this.logger.info('SEO Writing Assistant checker ready', {
      action: 'semrush.swa_open',
      url: page.url(),
    });
  }

  /** 直接打开 /swa/checker/ 会创建新文档，可绕过文档列表 */
  private async tryGotoCheckerDirect(page: Page): Promise<boolean> {
    if (page.url().includes('/swa/checker/') && (await this.isSwaCheckerReady(page))) {
      return true;
    }

    const checkerUrl = new URL(page.url());
    checkerUrl.pathname = '/swa/checker/';
    await page.goto(checkerUrl.toString(), { waitUntil: 'commit', timeout: 60_000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => undefined);
    await sleep(SEMRUSH_UI_SETTLE_MS);

    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (await this.isSwaCheckerReady(page)) return true;
      if (page.url().includes('/swa/checker/')) {
        await sleep(1_500);
        if (await this.isSwaCheckerReady(page)) return true;
      }
      await page.waitForTimeout(1_500);
    }

    return false;
  }

  private async tryClickCheckerEntry(page: Page): Promise<boolean> {
    const selectors = [
      SEMRUSH_SWA_SELECTORS.newAnalysis,
      SEMRUSH_SWA_SELECTORS.newDocument,
      'a[href*="/swa/checker/"]',
    ];

    for (const selector of selectors) {
      const target = page.locator(selector).first();
      if ((await target.count()) === 0) continue;
      if (!(await target.isVisible().catch(() => false))) continue;

      const clicked = await target
        .click({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        await page.waitForURL(/\/swa\/checker\//, { timeout: 60_000 }).catch(() => undefined);
        await sleep(SEMRUSH_UI_SETTLE_MS);
        if (await this.isSwaCheckerReady(page)) return true;
      }
    }

    return page
      .evaluate(`() => {
        const entryRe = /分析新文本|Analyze new text|新文档|New document/i;
        const link = [...document.querySelectorAll('a, button, [role="button"]')].find((el) =>
          entryRe.test(el.textContent ?? ''),
        );
        if (!link) return false;
        link.click();
        return true;
      }`)
      .then(async (clicked) => {
        if (!clicked) return false;
        await page.waitForURL(/\/swa\/checker\//, { timeout: 60_000 }).catch(() => undefined);
        await sleep(SEMRUSH_UI_SETTLE_MS);
        return this.isSwaCheckerReady(page);
      })
      .catch(() => false);
  }

  /**
   * 等待 Semrush 主站就绪（对齐 semrush-swa-nav-probe：过 cache-clean 后等 5s 即可）。
   */
  async waitForSemrushAppReady(page: Page, timeoutMs = 90_000): Promise<void> {
    await page.waitForURL(/sem\.3ue\.com/, { timeout: 30_000 }).catch(() => {
      throw new Error('点击「打开」后未跳转到 sem.3ue.com');
    });

    if (SEMRUSH_CACHE_CLEAN_PATTERN.test(page.url())) {
      await page
        .waitForURL((url) => !SEMRUSH_CACHE_CLEAN_PATTERN.test(url.href), {
          timeout: SEMRUSH_CACHE_CLEAN_MAX_MS,
        })
        .catch(() => {
          throw new Error(`cache-clean 中转页超过 ${SEMRUSH_CACHE_CLEAN_MAX_MS / 1000}s 未跳转`);
        });
    }

    await page.waitForTimeout(5_000);

    if (/sem\.3ue\.com/.test(page.url()) && !SEMRUSH_CACHE_CLEAN_PATTERN.test(page.url())) {
      this.logger.info('Semrush app ready', {
        action: 'semrush.app_ready',
        url: page.url(),
      });
      return;
    }

    throw new Error(`Semrush 主站 ${timeoutMs / 1000}s 内未就绪`);
  }

  private async createContext(browser: Browser): Promise<BrowserContext> {
    const hasState = await this.hasStorageState();
    const baseContext = {
      viewport: { width: 1440, height: 900 } as const,
      locale: 'zh-CN',
      /** 3ue gmitm 代理证书非公开 CA，必须忽略否则 sem.3ue.com 会卡死 */
      ignoreHTTPSErrors: true,
    };

    const context = await browser.newContext(
      hasState
        ? { ...baseContext, storageState: STORAGE_STATE_PATH }
        : baseContext,
    );

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    return context;
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

  private async openSemrushFromDashboard(
    dashPage: Page,
    context: BrowserContext,
    options?: OpenSemrushEditorOptions,
  ): Promise<SemrushEditorSession> {
    await dashPage.goto(TOOLS_SHARE_HOME_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await dashPage
      .locator(TOOLS_SHARE_SELECTORS.openSemrush)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });

    const onlineNodes = await this.listOnlineNodes(dashPage);
    if (!onlineNodes.length) {
      throw new Error('未找到可用的 Semrush 节点（均离线或未加载）');
    }

    const candidates = this.shuffleNodeLabels(onlineNodes);
    const preferred = options?.preferredNodeKey?.trim();
    if (preferred) {
      const preferredLabel = onlineNodes.find((label) => this.extractNodeKey(label) === preferred);
      if (preferredLabel) {
        // 优先尝试固定节点；失败则继续随机候选
        candidates.unshift(preferredLabel);
      }
    }
    const maxAttempts = Math.min(SEMRUSH_NODE_MAX_ATTEMPTS, candidates.length);
    const errors: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const nodeLabel = candidates[attempt];
      let semrushPage: Page | null = null;

      try {
        await this.restoreDashboardHome(dashPage);

        await this.selectSemrushNodeByLabel(dashPage, nodeLabel);
        semrushPage = await this.clickOpenSemrush(dashPage, context);
        await this.waitForSemrushAppReady(semrushPage, SEMRUSH_NODE_ATTEMPT_TIMEOUT_MS);

        const nodeKey = this.extractNodeKey(nodeLabel);
        this.logger.info('Semrush opened via node', {
          action: 'semrush.node_ok',
          node: nodeKey,
          attempt: attempt + 1,
        });

        return { page: semrushPage, nodeKey, nodeLabel };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${this.extractNodeKey(nodeLabel)}: ${message}`);

        this.logger.warn('Semrush node attempt failed, returning to dash home', {
          action: 'semrush.node_fail',
          node: this.extractNodeKey(nodeLabel),
          attempt: attempt + 1,
          maxAttempts,
          timeoutMs: SEMRUSH_NODE_ATTEMPT_TIMEOUT_MS,
          errorMessage: message,
        });

        await this.recoverToDashboard(semrushPage, dashPage);
      }
    }

    throw new Error(
      `已尝试 ${maxAttempts} 个节点仍无法打开 Semrush：${errors.join(' | ')}`,
    );
  }

  private async clickOpenSemrush(dashPage: Page, context: BrowserContext): Promise<Page> {
    const target = dashPage.locator(TOOLS_SHARE_SELECTORS.openSemrush).first();
    await target.waitFor({ state: 'visible', timeout: 30_000 });

    const popupPromise = context.waitForEvent('page', { timeout: 25_000 });
    await target.click();

    try {
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => undefined);
      return popup;
    } catch {
      if (/sem\.3ue\.com/.test(dashPage.url())) {
        return dashPage;
      }
      await dashPage.waitForURL(/sem\.3ue\.com/, { timeout: 10_000 }).catch(() => undefined);
      if (/sem\.3ue\.com/.test(dashPage.url())) {
        return dashPage;
      }
    }

    throw new Error('点击「打开」后未出现 Semrush 页面');
  }

  /** 关掉 Semrush 窗口/标签，并强制回到 3ue 首页以便重选节点 */
  private async recoverToDashboard(semrushPage: Page | null, dashPage: Page): Promise<void> {
    if (semrushPage && semrushPage !== dashPage) {
      await semrushPage.close().catch(() => undefined);
    }
    await this.restoreDashboardHome(dashPage);
  }

  private async restoreDashboardHome(dashPage: Page): Promise<void> {
    await dashPage.goto(TOOLS_SHARE_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });

    await Promise.race([
      dashPage.locator(TOOLS_SHARE_SELECTORS.openSemrush).first().waitFor({ state: 'visible', timeout: 20_000 }),
      dashPage.locator(TOOLS_SHARE_SELECTORS.username).waitFor({ state: 'visible', timeout: 20_000 }),
    ]).catch(() => undefined);

    if ((await dashPage.locator(TOOLS_SHARE_SELECTORS.openSemrush).count()) === 0) {
      await this.ensureToolsShareLogin(dashPage);
    }

    await dashPage.bringToFront().catch(() => undefined);

    this.logger.info('Returned to Tools Share home for next node', {
      action: 'semrush.dash_home',
      url: dashPage.url(),
    });
  }

  private async getBodyHtmlLength(page: Page): Promise<number> {
    const len = await page
      .evaluate('() => document.body?.innerHTML?.length ?? 0')
      .catch(() => 0);
    return typeof len === 'number' ? len : 0;
  }

  private async listOnlineNodes(page: Page): Promise<string[]> {
    await this.openNodeDropdown(page);
    const options = page.locator(TOOLS_SHARE_SELECTORS.nodeOption);
    const count = await options.count();
    const labels: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const text = ((await options.nth(i).textContent()) ?? '').trim();
      if (this.isNodeOnline(text)) labels.push(text);
    }

    await page.keyboard.press('Escape').catch(() => undefined);
    return labels;
  }

  /** Fisher–Yates 随机打乱在线节点，避免总选节点1 */
  private shuffleNodeLabels(labels: string[]): string[] {
    const shuffled = [...labels];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private async selectSemrushNodeByLabel(page: Page, label: string): Promise<void> {
    const card = page.locator(TOOLS_SHARE_SELECTORS.semrushCard).first();
    const nodeSelectBtn = card.locator(TOOLS_SHARE_SELECTORS.nodeSelectButton).first();
    await nodeSelectBtn.waitFor({ state: 'visible', timeout: 15_000 });

    const current = ((await nodeSelectBtn.textContent()) ?? '').trim();
    const nodeKey = this.extractNodeKey(label);

    if (current.includes(nodeKey) && this.isNodeOnline(current)) {
      return;
    }

    await this.openNodeDropdown(page);

    const option = page
      .locator(TOOLS_SHARE_SELECTORS.nodeOption)
      .filter({ hasText: new RegExp(nodeKey.replace(/\s+/g, '\\s*')) })
      .first();

    if ((await option.count()) === 0) {
      await page.keyboard.press('Escape').catch(() => undefined);
      throw new Error(`下拉中未找到节点 ${nodeKey}`);
    }

    await option.click();
    await page.keyboard.press('Escape').catch(() => undefined);

    this.logger.info('Semrush node selected', {
      action: 'semrush.node',
      node: nodeKey,
    });
  }

  private async openNodeDropdown(page: Page): Promise<void> {
    const card = page.locator(TOOLS_SHARE_SELECTORS.semrushCard).first();
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    const nodeSelectBtn = card.locator(TOOLS_SHARE_SELECTORS.nodeSelectButton).first();
    await nodeSelectBtn.waitFor({ state: 'visible', timeout: 15_000 });

    const options = page.locator(TOOLS_SHARE_SELECTORS.nodeOption);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await nodeSelectBtn.click();
      await page.waitForTimeout(250);
      if (await options.first().isVisible().catch(() => false)) return;

      await nodeSelectBtn.click();
      await page.waitForTimeout(250);
      if (await options.first().isVisible().catch(() => false)) return;

      await nodeSelectBtn.focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(250);
      if (await options.first().isVisible().catch(() => false)) return;
    }

    throw new Error('无法打开节点选择下拉');
  }

  private extractNodeKey(label: string): string {
    const match = label.match(/节点\s*\d+/);
    return match ? match[0].replace(/\s+/g, '') : label.slice(0, 24);
  }

  private isNodeOnline(label: string): boolean {
    return label.includes('✅') && !/❌\s*$/.test(label);
  }

}
