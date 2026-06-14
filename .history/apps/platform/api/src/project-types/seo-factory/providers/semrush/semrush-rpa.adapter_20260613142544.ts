/**
 * Semrush SEO Writing Assistant RPA：经 3ue 共享号自动查分。
 */

import { Injectable } from '@nestjs/common';
import type {
  ISeoCheckerProvider,
  SeoCheckInput,
  SeoScore,
  SemrushSuggestionDetails,
} from '@wm/provider-interfaces';
import type { Frame, Page, Response } from 'playwright';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { markdownToHtml } from './semrush-content';
import {
  SEMRUSH_RPA_TIMEOUT_MS,
  SEMRUSH_SCORE_STABLE_POLLS,
  SEMRUSH_SWA_EDITOR_TIMEOUT_MS,
  SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
  SEMRUSH_UI_SETTLE_MS,
} from './semrush.constants';
import { pollUntil, sleep, waitForAnyLocator } from './semrush-page-wait';
import { parseChecksPayload } from './semrush-checks.parser';
import {
  isSemrushRecommendationsPayload,
  parseLastStatusPayload,
  parseSemrushRecommendationsPayload,
  pickBestRecommendationsCapture,
  type ParsedSemrushRecommendations,
} from './semrush-recommendations.parser';
import { SemrushSessionManager } from './semrush-session.manager';
import { SEMRUSH_SWA_SELECTORS } from './semrush.selectors';

interface CapturedApiPayload {
  url: string;
  body: unknown;
}

const SECTION_LABELS: Record<keyof SemrushSuggestionDetails, string> = {
  readability: 'Readability',
  seo: 'SEO',
  tone: 'Tone',
  originality: 'Originality',
};

@Injectable()
export class SemrushRpaAdapter implements ISeoCheckerProvider {
  constructor(
    private readonly sessionManager: SemrushSessionManager,
    private readonly logger: LoggerService,
  ) {}

  async checkScore(input: SeoCheckInput): Promise<SeoScore> {
    if (process.env.SEMRUSH_ENABLED !== 'true') {
      return {
        overall: 0,
        suggestions: ['Semrush 未启用（SEMRUSH_ENABLED!=true）'],
        skipped: true,
      };
    }

    const startedAt = Date.now();

    try {
      return await this.sessionManager.withBrowser(async (context) => {
        const session = await this.sessionManager.openSemrushEditor(context);
        const { page, nodeKey, nodeLabel } = session;

        try {
          await this.gotoSeoWritingAssistant(page);
          await this.waitForCheckerShell(page);

          const apiCapture = this.setupApiCapture(page);
          let resolvedScore: number | undefined;
          try {
            resolvedScore = await this.fillAndAnalyze(
              page,
              input.keyword,
              input.content,
              apiCapture.getCaptured,
              input.recommendedKeywords,
            );
          } finally {
            apiCapture.dispose();
          }

          const captured = apiCapture.getCaptured();
          const result = await this.extractScoreAndSuggestions(
            page,
            captured,
            nodeKey,
            nodeLabel,
            resolvedScore,
          );

          this.logger.info('Semrush RPA check completed', {
            action: 'semrush.check_score',
            keyword: input.keyword,
            overall: result.overall,
            node: nodeKey,
            analysisSource: result.analysisSource,
            suggestionCount: result.suggestions.length,
            apiUrlCount: result.apiUrls?.length ?? 0,
            durationMs: Date.now() - startedAt,
          });

          return result;
        } finally {
          await page.close().catch(() => undefined);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      this.logger.error('Semrush RPA failed', {
        action: 'semrush.check_score_failed',
        keyword: input.keyword,
        durationMs: Date.now() - startedAt,
        errorMessage: message,
      });
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        `Semrush RPA 查分失败：${message}`,
      );
    }
  }

  private setupApiCapture(page: Page): {
    getCaptured: () => CapturedApiPayload[];
    dispose: () => void;
  } {
    const captured: CapturedApiPayload[] = [];

    const handler = async (response: Response) => {
      const url = response.url();
      if (!/sem\.3ue\.com|semrush/i.test(url)) return;
      if (!/swa|writing|checker|recommend|score|analyze|content|issue|metric|result|assistant|checks/i.test(url)) {
        return;
      }

      const contentType = response.headers()['content-type'] ?? '';
      if (!contentType.includes('json')) return;

      try {
        const body = await response.json();
        captured.push({ url, body });
      } catch {
        /* 非 JSON 或已消费 */
      }
    };

    page.on('response', handler);
    return {
      getCaptured: () => captured,
      dispose: () => page.off('response', handler),
    };
  }

  private async gotoSeoWritingAssistant(page: Page): Promise<void> {
    if (!page.url().includes('/swa/checker/')) {
      await this.sessionManager.navigateToSwaChecker(page);
    }
  }

  /** checker 壳层：编辑器 + 右侧推荐区异步加载，需轮询 */
  private async waitForCheckerShell(page: Page): Promise<void> {
    await waitForAnyLocator(
      page,
      (p) => p.locator(SEMRUSH_SWA_SELECTORS.editor),
      {
        timeoutMs: SEMRUSH_SWA_EDITOR_TIMEOUT_MS,
        label: 'SWA 编辑器',
      },
    );

    await sleep(SEMRUSH_UI_SETTLE_MS);

    await pollUntil(
      async () => {
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
        const analyzeVisible = await page
          .locator(SEMRUSH_SWA_SELECTORS.analyzeAction)
          .first()
          .isVisible()
          .catch(() => false);

        return panelVisible || goalsVisible || keywordVisible || analyzeVisible;
      },
      {
        timeoutMs: SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
        label: 'SWA 右侧内容推荐区',
      },
    ).catch(() => undefined);

    await sleep(SEMRUSH_UI_SETTLE_MS);
  }

  /** 拆成独立关键词，供 SWA 标签输入（禁止整串逗号一次填入） */
  private collectKeywordList(primary: string, recommendedKeywords?: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    const push = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(trimmed);
    };

    for (const part of primary.split(/[,，]/)) {
      push(part);
    }
    for (const item of recommendedKeywords ?? []) {
      for (const part of item.split(/[,，]/)) {
        push(part);
      }
    }

    return result.slice(0, 30);
  }

  private async fillAndAnalyze(
    page: Page,
    keyword: string,
    content: string,
    getCaptured: () => CapturedApiPayload[],
    recommendedKeywords?: string[],
  ): Promise<number> {
    const htmlContent = markdownToHtml(content);

    const editor = await waitForAnyLocator(
      page,
      (p) => p.locator(SEMRUSH_SWA_SELECTORS.editor),
      { timeoutMs: SEMRUSH_SWA_EDITOR_TIMEOUT_MS, label: 'SWA 编辑器' },
    );

    await this.setupKeywordGoal(page, keyword, recommendedKeywords);
    await sleep(SEMRUSH_UI_SETTLE_MS);

    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await sleep(500);

    await editor.evaluate((el, html) => {
      el.innerHTML = html;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, htmlContent);

    await editor.click();
    await sleep(SEMRUSH_UI_SETTLE_MS);
    await this.dismissOverlays(page);

    await this.clickAnalyzeButton(page);

    await sleep(3_000);
    const score = await this.waitForScore(page, getCaptured);
    await sleep(SEMRUSH_UI_SETTLE_MS);
    return score;
  }

  private async setupKeywordGoal(
    page: Page,
    keyword: string,
    recommendedKeywords?: string[],
  ): Promise<void> {
    const keywords = this.collectKeywordList(keyword, recommendedKeywords);
    const keywordInput = await this.ensureKeywordInputVisible(page);

    await this.clearExistingKeywordTags(page, keywordInput);
    await this.typeKeywordTags(page, keywordInput, keywords);
    await sleep(SEMRUSH_UI_SETTLE_MS);

    await this.applyKeywordGoal(page, keywordInput);
    await sleep(SEMRUSH_UI_SETTLE_MS);

    this.logger.info('Semrush keyword goal set', {
      action: 'semrush.keyword_goal',
      keywords,
      keywordCount: keywords.length,
      primaryKeyword: keyword,
      recommendedCount: recommendedKeywords?.length ?? 0,
    });
  }

  private async clearExistingKeywordTags(
    page: Page,
    keywordInput: ReturnType<Page['locator']>,
  ): Promise<void> {
    await keywordInput.click().catch(() => undefined);
    await keywordInput.fill('').catch(() => undefined);

    await page
      .evaluate(`() => {
        const input = document.querySelector(
          'input[placeholder*="关键词"], input[placeholder*="keyword"], input[placeholder*="逗号"], textarea[placeholder*="关键词"], textarea[placeholder*="keyword"]',
        );
        if (!input) return;
        let parent = input.parentElement;
        for (let depth = 0; depth < 8 && parent; depth += 1) {
          const buttons = parent.querySelectorAll(
            'button[aria-label*="Remove"], button[aria-label*="删除"], button[class*="close" i], button[class*="remove" i]',
          );
          for (const btn of buttons) {
            btn.click();
          }
          parent = parent.parentElement;
        }
      }`)
      .catch(() => undefined);

    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Backspace').catch(() => undefined);
    }
    await sleep(400);
  }

  /** 逐个输入关键词并以逗号/回车生成标签（与 SWA UI 一致） */
  private async typeKeywordTags(
    _page: Page,
    keywordInput: ReturnType<Page['locator']>,
    keywords: string[],
  ): Promise<void> {
    await keywordInput.click();
    await keywordInput.fill('');

    for (const kw of keywords) {
      await keywordInput.pressSequentially(kw, { delay: 20 });
      await sleep(200);
      await keywordInput.press(',');
      await sleep(350);
    }

    if (keywords.length > 0) {
      await keywordInput.press('Enter').catch(() => undefined);
      await sleep(300);
    }
  }

  private async ensureKeywordInputVisible(page: Page): Promise<ReturnType<Page['locator']>> {
    const keywordLocator = () => page.locator(SEMRUSH_SWA_SELECTORS.keywordInput).first();

    await pollUntil(
      async () => {
        if (await keywordLocator().isVisible().catch(() => false)) {
          return true;
        }

        await this.tryExpandNewGoals(page);
        await sleep(SEMRUSH_UI_SETTLE_MS);
        return keywordLocator().isVisible().catch(() => false);
      },
      {
        timeoutMs: SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
        label: '关键词输入框（需展开「设置新目标」）',
      },
    );

    return keywordLocator();
  }

  private async tryExpandNewGoals(page: Page): Promise<void> {
    const expanders = [
      page.locator(SEMRUSH_SWA_SELECTORS.setNewGoals).first(),
      page.getByText('设置新目标', { exact: true }),
      page.getByText('Set new goals', { exact: true }),
    ];

    for (const expander of expanders) {
      if (!(await expander.isVisible().catch(() => false))) continue;
      await expander.scrollIntoViewIfNeeded().catch(() => undefined);
      await expander.click({ timeout: 5_000 }).catch(() => undefined);
      await sleep(SEMRUSH_UI_SETTLE_MS);
      return;
    }

    await page
      .evaluate(`() => {
        const target = [...document.querySelectorAll('button, a, div, span, h3, h4')].find((el) => {
          const text = (el.textContent || '').trim();
          return text === '设置新目标' || /^Set new goals$/i.test(text);
        });
        if (target) {
          target.scrollIntoView({ block: 'center' });
          target.click();
          return true;
        }
        return false;
      }`)
      .catch(() => false);

    await sleep(SEMRUSH_UI_SETTLE_MS);
  }

  private async applyKeywordGoal(
    page: Page,
    keywordInput: ReturnType<Page['locator']>,
  ): Promise<void> {
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      const applyBtn = page.locator(SEMRUSH_SWA_SELECTORS.applyKeywordGoal).first();
      if (await applyBtn.isVisible().catch(() => false)) {
        await applyBtn.scrollIntoViewIfNeeded().catch(() => undefined);
        await applyBtn.click().catch(() => undefined);
        await sleep(SEMRUSH_UI_SETTLE_MS);
        return;
      }

      const roleBtn = page.getByRole('button', {
        name: /应用|确认|设置目标|用于本文档|Apply|Set goal|Use for this document/i,
      });
      if (await roleBtn.first().isVisible().catch(() => false)) {
        await roleBtn.first().click().catch(() => undefined);
        await sleep(SEMRUSH_UI_SETTLE_MS);
        return;
      }

      await sleep(1_500);
    }

    await keywordInput.press('Enter').catch(() => undefined);
    await sleep(500);
    await page.keyboard.press('Tab').catch(() => undefined);
    await page.keyboard.press('Enter').catch(() => undefined);
    await sleep(SEMRUSH_UI_SETTLE_MS);
  }

  private async dismissOverlays(page: Page): Promise<void> {
    const closers = [
      'button[aria-label="Close"]',
      'button[aria-label="关闭"]',
      'button:has-text("关闭")',
      'button:has-text("Close")',
      '[class*="banner" i] button[class*="close" i]',
    ];

    for (const sel of closers) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2_000 }).catch(() => undefined);
        await sleep(500);
      }
    }
  }

  private async clickAnalyzeButton(page: Page): Promise<void> {
    const labels = ['获取推荐', 'Get recommendations', '重新分析', 'Re-analyze'];

    await pollUntil(
      async () => {
        await page.evaluate('() => window.scrollTo(0, 0)').catch(() => undefined);
        await page
          .locator(SEMRUSH_SWA_SELECTORS.editor)
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => undefined);

        for (const frame of page.frames()) {
          const locator = frame.locator(SEMRUSH_SWA_SELECTORS.analyzeAction).first();
          if (await locator.isVisible().catch(() => false)) {
            await locator.scrollIntoViewIfNeeded().catch(() => undefined);
            if (await locator.isEnabled().catch(() => true)) {
              await locator.click({ timeout: 5_000 }).catch(() => undefined);
              return true;
            }
          }

          const roleBtn = frame.getByRole('button', {
            name: /获取推荐|Get recommendations|重新分析|Re-analyze/i,
          });
          if (await roleBtn.first().isVisible().catch(() => false)) {
            await roleBtn.first().click({ timeout: 5_000 }).catch(() => undefined);
            return true;
          }
        }

        const clicked = await page.evaluate(`() => {
          const labels = ${JSON.stringify(labels)};
          const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
          const btn = nodes.find((el) => {
            const text = (el.textContent || '').trim();
            if (!labels.some((label) => text.includes(label))) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          });
          if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return true;
        }`);

        return Boolean(clicked);
      },
      {
        timeoutMs: SEMRUSH_RPA_TIMEOUT_MS,
        label: '「获取推荐」或「重新分析」按钮',
      },
    );
  }

  private async waitForScore(
    page: Page,
    getCaptured: () => CapturedApiPayload[],
  ): Promise<number> {
    const deadline = Date.now() + SEMRUSH_RPA_TIMEOUT_MS;
    const stablePollsRequired = Math.max(2, SEMRUSH_SCORE_STABLE_POLLS);
    let lastSnippet = '';
    let stableCount = 0;
    let lastMerged: number | null = null;

    while (Date.now() < deadline) {
      const analysisComplete = await this.isAnalysisComplete(page);
      const domScore = this.resolveScore(await this.tryReadScore(page));
      const fetched = await this.fetchRecommendationsWhenReady(
        page,
        analysisComplete ? 2_000 : 1_000,
      );
      const apiScore = this.resolveScore(
        fetched?.overall ??
          pickBestRecommendationsCapture(getCaptured())?.overall ??
          this.tryReadScoreFromApi(getCaptured()),
      );
      const mergedScore = this.pickOverallScore(domScore, apiScore, 'waitForScore');

      if (mergedScore !== null && analysisComplete) {
        if (lastMerged !== null && Math.abs(mergedScore - lastMerged) < 0.05) {
          stableCount += 1;
        } else {
          stableCount = 1;
        }
        lastMerged = mergedScore;

        if (stableCount >= stablePollsRequired) {
          const finalDomScore = this.resolveScore(await this.tryReadScore(page));
          const finalScore =
            this.pickOverallScore(finalDomScore, apiScore, 'waitForScore.final') ??
            mergedScore;

          this.logger.info('Semrush score stable after analysis', {
            action: 'semrush.score_resolved',
            score: finalScore,
            domScore: finalDomScore ?? domScore,
            apiScore,
            stablePolls: stableCount,
            source: finalDomScore !== null ? 'dom' : domScore !== null ? 'dom' : 'api',
          });
          return finalScore;
        }
      } else {
        stableCount = 0;
        lastMerged = null;
      }

      lastSnippet = await page
        .locator('body')
        .innerText()
        .then((t) => t.replace(/\s+/g, ' ').slice(0, 200))
        .catch(() => '');

      await sleep(2_000);
    }

    throw new Error(
      `等待 Semrush 评分超时（页面片段：${lastSnippet || '空'}）`,
    );
  }

  /** 接受 0.1–10 的有效分数（避免把词数等误判进来） */
  private resolveScore(raw: number | null | undefined): number | null {
    if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
    if (raw > 0 && raw <= 10) return raw;
    return null;
  }

  /** 优先采用侧栏 DOM 分数，与 API 冲突时以 DOM 为准 */
  private pickOverallScore(
    domScore: number | null,
    apiScore: number | null,
    context: string,
  ): number | null {
    if (domScore !== null && apiScore !== null && Math.abs(domScore - apiScore) >= 1) {
      this.logger.warn('Semrush score mismatch, preferring DOM', {
        action: 'semrush.score_mismatch',
        context,
        domScore,
        apiScore,
      });
      return domScore;
    }
    return domScore ?? apiScore;
  }

  private async isAnalysisComplete(page: Page): Promise<boolean> {
    const markers = [
      SEMRUSH_SWA_SELECTORS.reAnalyze,
      SEMRUSH_SWA_SELECTORS.suggestionListItem,
      'text=可读性',
      'text=Readability',
      SEMRUSH_SWA_SELECTORS.scoreBlock,
    ];

    for (const sel of markers) {
      if (await page.locator(sel).first().isVisible().catch(() => false)) {
        return true;
      }
    }
    return false;
  }

  private async tryReadScore(page: Page): Promise<number | null> {
    const fromEvaluate = await page.evaluate(`() => {
      const collectText = (root) => {
        const parts = [];
        const visit = (node) => {
          if (!node) return;
          if (node.shadowRoot) visit(node.shadowRoot);
          if (node.nodeType === Node.TEXT_NODE) {
            const t = (node.textContent || '').trim();
            if (t) parts.push(t);
          }
          const children = node.childNodes || [];
          for (let i = 0; i < children.length; i++) visit(children[i]);
        };
        visit(root);
        return parts.join(' ');
      };

      const parseNum = (raw) => {
        const v = parseFloat(String(raw).replace(',', '.'));
        return Number.isFinite(v) && v > 0 && v <= 10 ? v : null;
      };

      const pickOverall = (text) => {
        if (!text) return null;

        const qualityHint = text.match(
          /(?:文章质量得分|质量得分|Overall|Score)[：:]?\\s*(\\d{1,2}(?:[.,]\\d+)?)\\s*[（(]\\s*共\\s*10/i,
        );
        if (qualityHint) return parseNum(qualityHint[1]);

        const labeledBefore = text.match(
          /(?:极佳|糟糕|良好|优秀|一般|中等|Needs improvement|Overall|Score|整体|分数)[^\\d]{0,32}(\\d{1,2}(?:[.,]\\d+)?)\\s*\\/\\s*10/i,
        );
        if (labeledBefore) return parseNum(labeledBefore[1]);

        const labeledAfter = text.match(
          /(\\d{1,2}(?:[.,]\\d+)?)\\s*\\/\\s*10[^\\d]{0,16}(?:极佳|糟糕|良好|优秀|一般|Overall|Score|整体|分数)/i,
        );
        if (labeledAfter) return parseNum(labeledAfter[1]);

        const slash = [...text.matchAll(/(\\d{1,2}(?:[.,]\\d+)?)\\s*\\/\\s*10/g)];
        for (const m of slash) {
          const v = parseNum(m[1]);
          if (v !== null) return v;
        }

        const labeledOnly = text.match(
          /(?:极佳|糟糕|良好|优秀|一般|Needs improvement|Overall|Score|整体|分数)[^\\d]{0,24}(\\d{1,2}(?:[.,]\\d+)?)/i,
        );
        if (labeledOnly) return parseNum(labeledOnly[1]);

        return null;
      };

      const widget = document.querySelector('[data-test="swa-spa-checker-widget"]');
      if (widget) {
        for (const el of widget.querySelectorAll('[aria-label]')) {
          const v = pickOverall(el.getAttribute('aria-label') || '');
          if (v !== null) return v;
        }
        const v = pickOverall((widget.textContent || '').trim());
        if (v !== null) return v;
      }

      const selectors = [
        '[class*="overall"]',
        '[class*="Overall"]',
        '[class*="score"]',
        '[class*="Score"]',
        '[class*="rating"]',
        '[data-test*="score"]',
      ];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const v = pickOverall((el.textContent || '').trim());
          if (v !== null) return v;
        }
      }

      return pickOverall(collectText(document.body));
    }`);

    if (typeof fromEvaluate === 'number' && fromEvaluate > 0 && fromEvaluate <= 10) {
      return fromEvaluate;
    }

    const bodyText = await page.locator('body').innerText().catch(() => '');
    return this.parseScoreText(bodyText);
  }

  private tryReadScoreFromApi(captured: CapturedApiPayload[]): number | null {
    return pickBestRecommendationsCapture(captured)?.overall ?? null;
  }

  private countSuggestions(details?: SemrushSuggestionDetails | null): number {
    if (!details) return 0;
    return ['readability', 'seo', 'tone', 'originality'].reduce(
      (sum, key) => sum + ((details as SemrushSuggestionDetails)[key as keyof SemrushSuggestionDetails]?.length ?? 0),
      0,
    );
  }

  private buildLastStatusApiUrl(page: Page): string | null {
    const pageUrl = new URL(page.url());
    const apiUrl = new URL(pageUrl.origin);
    apiUrl.pathname = '/swa/api/recommendations/last_status/';
    pageUrl.searchParams.forEach((value, key) => {
      apiUrl.searchParams.set(key, value);
    });
    return apiUrl.toString();
  }

  private async fetchChecksSuggestions(
    page: Page,
    captured: CapturedApiPayload[],
  ): Promise<SemrushSuggestionDetails> {
    for (const { url, body } of captured) {
      if (!/\/checks/i.test(url)) continue;
      const parsed = parseChecksPayload(body);
      if (this.hasAnySuggestions(parsed)) return parsed;
    }

    const gdocMatch = page.url().match(/smr-[0-9a-f-]+/i);
    if (!gdocMatch) return {};

    const pageUrl = new URL(page.url());
    const paths = [
      `/swa/api/checks/gdoc_id/${gdocMatch[0]}/`,
      `/swa/api/checks/?gdoc_id=${gdocMatch[0]}`,
      `/swa/api/recommendations/gdoc_id/${gdocMatch[0]}/checks/`,
    ];

    for (const path of paths) {
      const apiUrl = new URL(pageUrl.origin);
      apiUrl.pathname = path.split('?')[0];
      const qs = path.includes('?') ? path.split('?')[1] : '';
      if (qs) {
        for (const part of qs.split('&')) {
          const [key, value] = part.split('=');
          if (key && value) apiUrl.searchParams.set(key, value);
        }
      }
      pageUrl.searchParams.forEach((value, key) => apiUrl.searchParams.set(key, value));

      try {
        const body = await page.evaluate(async (url) => {
          const response = await fetch(url, { credentials: 'include' });
          if (!response.ok) return null;
          return response.json();
        }, apiUrl.toString());

        const parsed = parseChecksPayload(body);
        if (this.hasAnySuggestions(parsed)) {
          this.logger.info('Semrush checks API parsed', {
            action: 'semrush.checks_api',
            url: apiUrl.toString(),
            count: this.countSuggestions(parsed),
          });
          return parsed;
        }
      } catch {
        /* try next path */
      }
    }

    return {};
  }

  private async fetchLastStatusSuggestions(page: Page): Promise<SemrushSuggestionDetails> {
    const apiUrl = this.buildLastStatusApiUrl(page);
    if (!apiUrl) return {};

    try {
      const body = await page.evaluate(async (url) => {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) return null;
        return response.json();
      }, apiUrl);

      return parseLastStatusPayload(body);
    } catch {
      return {};
    }
  }

  private buildRecommendationsApiUrl(page: Page): string | null {
    const pageUrl = new URL(page.url());
    const gdocMatch = pageUrl.pathname.match(/smr-[0-9a-f-]{36}/i);
    if (!gdocMatch) return null;

    const apiUrl = new URL(pageUrl.origin);
    apiUrl.pathname = `/swa/api/recommendations/gdoc_id/${gdocMatch[0]}/`;
    pageUrl.searchParams.forEach((value, key) => {
      apiUrl.searchParams.set(key, value);
    });
    return apiUrl.toString();
  }

  private async fetchRecommendationsWhenReady(
    page: Page,
    timeoutMs: number,
  ): Promise<ParsedSemrushRecommendations | null> {
    const apiUrl = this.buildRecommendationsApiUrl(page);
    if (!apiUrl) return null;

    const deadline = Date.now() + timeoutMs;
    let lastParsed: ParsedSemrushRecommendations | null = null;

    while (Date.now() < deadline) {
      try {
        const body = await page.evaluate(async (url) => {
          const response = await fetch(url, { credentials: 'include' });
          if (!response.ok) return null;
          return response.json();
        }, apiUrl);

        if (isSemrushRecommendationsPayload(body)) {
          const parsed = parseSemrushRecommendationsPayload(body);
          lastParsed = parsed;
          if (body.data_ready === true && parsed.overall !== undefined) {
            return parsed;
          }
        }
      } catch {
        /* 网络抖动时继续轮询 */
      }
      await sleep(2_000);
    }

    return lastParsed;
  }

  private parseScoreText(text: string | null | undefined): number | null {
    if (!text) return null;

    const labeledBefore = text.match(
      /(?:极佳|糟糕|良好|优秀|一般|中等|Overall|Score|整体|分数)\D{0,32}(\d{1,2}(?:[.,]\d+)?)\s*\/\s*10/i,
    );
    if (labeledBefore) {
      const value = Number(labeledBefore[1].replace(',', '.'));
      if (Number.isFinite(value) && value > 0 && value <= 10) return value;
    }

    const slashMatches = [...text.matchAll(/(\d{1,2}(?:[.,]\d+)?)\s*\/\s*10/g)];
    for (const m of slashMatches) {
      const value = Number(m[1].replace(',', '.'));
      if (Number.isFinite(value) && value > 0 && value <= 10) {
        return value;
      }
    }

    const match = text.match(
      /(?:Overall|整体|分数|Score|极佳|糟糕|良好|优秀|一般)\D{0,24}(\d{1,2}(?:[.,]\d+)?)/i,
    );
    if (match) {
      const value = Number(match[1].replace(',', '.'));
      return Number.isFinite(value) && value > 0 && value <= 10 ? value : null;
    }

    return null;
  }

  private async extractScoreAndSuggestions(
    page: Page,
    captured: CapturedApiPayload[],
    nodeKey: string,
    nodeLabel: string,
    resolvedScore?: number,
  ): Promise<SeoScore> {
    const apiCaptured = pickBestRecommendationsCapture(captured);
    const apiPrefetched = apiCaptured ?? (await this.fetchRecommendationsWhenReady(page, 5_000));
    const domScore = this.resolveScore(
      resolvedScore ?? (await this.tryReadScore(page)),
    );
    const apiScore = this.resolveScore(
      apiPrefetched?.overall ?? this.tryReadScoreFromApi(captured),
    );
    const overall = this.pickOverallScore(domScore, apiScore, 'extractScoreAndSuggestions');
    if (overall === null) {
      const snippet = await page
        .locator('body')
        .innerText()
        .then((t) => t.replace(/\s+/g, ' ').slice(0, 240))
        .catch(() => '');
      throw new Error(
        `未能解析 Semrush Overall Score（页面片段：${snippet || '空'}）`,
      );
    }

    this.logger.info('Semrush collecting sidebar suggestions', {
      action: 'semrush.sidebar_collect_start',
      overall,
      hasCapturedApi: Boolean(apiCaptured),
    });

    await this.prepareSidebarForExtraction(page);
    await pollUntil(
      async () => {
        const listItemCount = await page
          .locator(SEMRUSH_SWA_SELECTORS.suggestionListItem)
          .count()
          .catch(() => 0);
        const widgetVisible = await page
          .locator(SEMRUSH_SWA_SELECTORS.checkerWidget)
          .isVisible()
          .catch(() => false);
        return listItemCount > 0 || widgetVisible || Boolean(apiCaptured);
      },
      { timeoutMs: 20_000, intervalMs: 800, label: 'Semrush 侧栏就绪' },
    ).catch(() => undefined);

    const apiFetched =
      apiCaptured ?? (await this.fetchRecommendationsWhenReady(page, 5_000));
    const lastStatusDetails = this.normalizeSuggestionDetails(
      await this.fetchLastStatusSuggestions(page),
    );
    const checksDetails = this.normalizeSuggestionDetails(
      await this.fetchChecksSuggestions(page, captured),
    );
    const apiDetails = this.normalizeSuggestionDetails(
      this.mergeSuggestionDetails(
        this.mergeSuggestionDetails(apiFetched?.details, apiCaptured?.details),
        this.mergeSuggestionDetails(lastStatusDetails, checksDetails),
      ),
    );

    await this.prepareSidebarForExtraction(page);
    const domDetails = this.normalizeSuggestionDetails(
      await this.extractSuggestionsFromDom(page, { skipPrepare: true }),
    );

    if (process.env.SEMRUSH_DEBUG_SIDEBAR === '1') {
      await this.dumpSidebarDebug(page, { apiDetails, domDetails }).catch(() => undefined);
    }

    const suggestionDetails = this.mergeSuggestionDetails(domDetails, apiDetails);

    let analysisSource: SeoScore['analysisSource'];
    const hasApi = this.hasAnySuggestions(apiDetails);
    const hasDom = this.hasAnySuggestions(domDetails);
    if (hasApi && hasDom) {
      analysisSource = 'mixed';
    } else if (hasApi) {
      analysisSource = 'api';
    } else {
      analysisSource = 'dom';
    }

    const recommendationsApiUrl = this.buildRecommendationsApiUrl(page);
    const lastStatusApiUrl = this.buildLastStatusApiUrl(page);
    const apiUrls = [
      ...new Set([
        ...captured.map((c) => c.url),
        ...(recommendationsApiUrl ? [recommendationsApiUrl] : []),
        ...(lastStatusApiUrl ? [lastStatusApiUrl] : []),
      ]),
    ];

    const suggestions = this.flattenSuggestions(suggestionDetails);

    if (apiUrls.length > 0) {
      this.logger.info('Semrush API responses captured during analysis', {
        action: 'semrush.api_capture',
        urls: apiUrls,
        analysisSource,
      });
    }

    const semrushRecommendedKeywords = this.collectSemrushRecommendedKeywords(
      apiPrefetched,
      apiFetched,
      captured,
    );

    const finalDomScore = this.resolveScore(await this.tryReadScore(page));
    const finalApiScore = this.resolveScore(
      (await this.fetchRecommendationsWhenReady(page, 3_000))?.overall ??
        apiFetched?.overall ??
        apiPrefetched?.overall,
    );
    const finalOverall =
      this.pickOverallScore(finalDomScore, finalApiScore, 'extractScoreAndSuggestions.final') ??
      overall;

    if (finalOverall !== overall) {
      this.logger.info('Semrush score adjusted after sidebar extraction', {
        action: 'semrush.score_adjusted',
        initial: overall,
        final: finalOverall,
        finalDomScore,
        finalApiScore,
      });
    }

    const metricsSource = apiFetched ?? apiCaptured ?? apiPrefetched;

    return {
      overall: finalOverall,
      suggestions,
      semrushRecommendedKeywords,
      semrushCompetitorWordCount: metricsSource?.competitorWordCount,
      semrushCurrentWordCount: metricsSource?.currentWordCount,
      semrushReadabilityScore: metricsSource?.readabilityScore,
      node: nodeKey,
      nodeLabel,
      suggestionDetails,
      analysisSource,
      apiUrls: apiUrls.length > 0 ? apiUrls : undefined,
    };
  }

  private collectSemrushRecommendedKeywords(
    ...sources: Array<ParsedSemrushRecommendations | CapturedApiPayload[] | null | undefined>
  ): string[] | undefined {
    const merged: string[] = [];
    const seen = new Set<string>();

    const push = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(trimmed);
    };

    for (const source of sources) {
      if (!source) continue;
      if (Array.isArray(source)) {
        for (const item of source) {
          if (!isSemrushRecommendationsPayload(item.body)) continue;
          const parsed = parseSemrushRecommendationsPayload(item.body);
          for (const kw of parsed.recommendedKeywords ?? []) push(kw);
        }
        continue;
      }
      for (const kw of source.recommendedKeywords ?? []) push(kw);
    }

    return merged.length > 0 ? merged.slice(0, 20) : undefined;
  }

  private normalizeSuggestionDetails(
    details?: SemrushSuggestionDetails | null,
  ): SemrushSuggestionDetails {
    if (!details || typeof details !== 'object') {
      return {};
    }
    return details;
  }

  private hasAnySuggestions(details?: SemrushSuggestionDetails | null): boolean {
    if (!details || typeof details !== 'object') return false;
    return Object.values(details).some(
      (items) => Array.isArray(items) && items.length > 0,
    );
  }

  private mergeSuggestionDetails(
    primary?: SemrushSuggestionDetails | null,
    secondary?: SemrushSuggestionDetails | null,
  ): SemrushSuggestionDetails {
    const safePrimary = this.normalizeSuggestionDetails(primary);
    const safeSecondary = this.normalizeSuggestionDetails(secondary);
    const keys = ['readability', 'seo', 'tone', 'originality'] as const;
    const merged: SemrushSuggestionDetails = {};

    for (const key of keys) {
      const combined = [...(safePrimary[key] ?? []), ...(safeSecondary[key] ?? [])];
      const unique = [...new Set(combined.map((s) => s.trim()).filter(Boolean))];
      if (unique.length > 0) {
        merged[key] = unique;
      }
    }

    return merged;
  }

  private flattenSuggestions(details?: SemrushSuggestionDetails | null): string[] {
    const safeDetails = this.normalizeSuggestionDetails(details);
    const flat: string[] = [];
    const keys = ['readability', 'seo', 'tone', 'originality'] as const;

    for (const key of keys) {
      for (const item of safeDetails[key] ?? []) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        flat.push(`[${SECTION_LABELS[key]}] ${trimmed}`);
      }
    }

    return flat;
  }

  private async dumpSidebarDebug(
    page: Page,
    ctx: { apiDetails: SemrushSuggestionDetails; domDetails: SemrushSuggestionDetails },
  ): Promise<void> {
    const dump = (await page.evaluate(`() => {
      const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ');
      const vw = window.innerWidth;
      const rightSide = [...document.querySelectorAll('li, p, span, div, button')]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.x > vw * 0.42 && rect.y > 60 && rect.width > 0 && el.children.length <= 4;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: (el.className?.toString?.() || '').slice(0, 100),
          text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
        }))
        .filter((x) => x.text.length > 8 && x.text.length < 500);
      const idx = bodyText.indexOf('可读性');
      return {
        url: location.href,
        readabilitySlice: idx >= 0 ? bodyText.slice(idx, idx + 3000) : null,
        hasMarkers: {
          readability: bodyText.includes('可读性'),
          complex: bodyText.includes('过于复杂'),
          splitPara: bodyText.includes('拆分长段'),
          tone: bodyText.includes('语气'),
        },
        rightSide: [...new Map(rightSide.map((x) => [x.text, x])).values()].slice(0, 60),
      };
    }`)) as Record<string, unknown>;

    this.logger.info('Semrush sidebar debug dump', {
      action: 'semrush.sidebar_debug',
      dump,
      apiDetails: ctx.apiDetails,
      domDetails: ctx.domDetails,
    });
  }

  private async prepareSidebarForExtraction(page: Page): Promise<void> {
    await page
      .evaluate(`() => {
        const widget = document.querySelector('[data-test="swa-spa-checker-widget"]');
        widget?.scrollIntoView({ block: 'start' });
        const scroll = widget?.querySelector('[data-ui-name="ScrollArea.Container"]');
        if (scroll) {
          const step = 320;
          for (let y = 0; y <= scroll.scrollHeight; y += step) {
            scroll.scrollTop = y;
          }
          scroll.scrollTop = scroll.scrollHeight;
        }
      }`)
      .catch(() => undefined);
    await sleep(600);
  }

  private async extractSuggestionsFromDom(
    page: Page,
    options?: { skipPrepare?: boolean },
  ): Promise<SemrushSuggestionDetails> {
    if (!options?.skipPrepare) {
      await this.prepareSidebarForExtraction(page);
    }

    let merged: SemrushSuggestionDetails = {};
    for (const frame of page.frames()) {
      try {
        const partial = await this.extractSuggestionsFromFrame(frame);
        merged = this.mergeSuggestionDetails(merged, partial);
      } catch {
        /* cross-origin or detached frame */
      }
    }

    if (process.env.SEMRUSH_DEBUG_SIDEBAR === '1' && !this.hasAnySuggestions(merged)) {
      this.logger.info('Semrush DOM extract empty after all frames', {
        action: 'semrush.dom_extract_empty',
        frameCount: page.frames().length,
      });
    }

    return this.normalizeSuggestionDetails(merged);
  }

  private async extractSuggestionsFromFrame(frame: Frame): Promise<SemrushSuggestionDetails> {
    const raw = (await frame.evaluate(`() => {
      const noise =
        /免费检查|Smart Writer|已用|增加限额|重述工具|创作|询问 AI|用于本文档|设置新目标|内容推荐|SEO Writing Assistant|文档：|站点表现|竞品分析|关键词研究|跳到内容|Enterprise|我的档案|发送反馈|这有帮助吗/i;

      const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
      const isBulletText = (text) =>
        text.length > 6 && text.length < 800 && !noise.test(text);

      const widget = document.querySelector('[data-test="swa-spa-checker-widget"]');
      if (!widget) return {};

      const sectionMap = {
        readability: ['可读性', 'Readability'],
        seo: ['SEO'],
        tone: ['语气', 'Tone'],
        originality: ['原创性', 'Originality'],
      };

      const extractListItemText = (item) => {
        const textBoxes = item.querySelectorAll('[data-ui-name="Box"]');
        for (const box of textBoxes) {
          const style = box.getAttribute('style') || '';
          if (!style.includes('overflow-wrap')) continue;
          const tags = [...box.querySelectorAll('[data-ui-name="Tag.Text"]')]
            .map((tag) => normalize(tag.textContent))
            .filter(Boolean);
          let text = normalize(box.innerText || box.textContent);
          if (!text) continue;
          if (tags.length > 0 && /关键词|keyword/i.test(text)) {
            const prefix = text.split(tags[0])[0].trim();
            const suffix = tags.length > 8 ? \` 等 \${tags.length} 个\` : '';
            text = \`\${prefix} \${tags.slice(0, 8).join(', ')}\${suffix}\`.trim();
          }
          return text;
        }
        return normalize(item.innerText || item.textContent);
      };

      const details = {};
      for (const section of widget.querySelectorAll('section[aria-labelledby]')) {
        const titleId = section.getAttribute('aria-labelledby');
        const titleEl = titleId ? document.getElementById(titleId) : null;
        const title = normalize(titleEl?.textContent);
        if (!title) continue;

        let targetKey = null;
        for (const [key, labels] of Object.entries(sectionMap)) {
          if (labels.includes(title)) {
            targetKey = key;
            break;
          }
        }
        if (!targetKey) continue;

        const items = [...section.querySelectorAll('[role="list"] [role="listitem"]')]
          .map(extractListItemText)
          .filter(isBulletText);

        if (items.length > 0) {
          details[targetKey] = [...new Set(items)].slice(0, 20);
        }
      }

      const hasStructured = Object.values(details).some((items) => items?.length > 0);
      if (!hasStructured) {
        const widgetText = normalize(widget.innerText || widget.textContent);
        for (const [key, labels] of Object.entries(sectionMap)) {
          for (const label of labels) {
            const idx = widgetText.indexOf(label);
            if (idx < 0) continue;
            const slice = widgetText.slice(idx + label.length, idx + label.length + 2500);
            const bullets = [...slice.matchAll(/[•●▪◦-]\\s*([^•●▪◦\\n]{8,400})/g)]
              .map((m) => normalize(m[1]))
              .filter(isBulletText);
            if (bullets.length > 0) {
              details[key] = [...new Set([...(details[key] ?? []), ...bullets])].slice(0, 20);
            }
          }
        }
      }

      return details;
    }`)) as SemrushSuggestionDetails;

    return this.normalizeSuggestionDetails(raw);
  }
}
