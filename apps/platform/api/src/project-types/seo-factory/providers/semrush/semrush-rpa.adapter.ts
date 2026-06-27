/**
 * Semrush SEO Writing Assistant RPA：经 3ue 共享号自动查分。
 */

import { Injectable } from '@nestjs/common';
import type {
  ISeoCheckerProvider,
  SeoCheckInput,
  SeoScore,
  SemrushActionableIssue,
  SemrushSuggestionDetails,
} from '@wm/provider-interfaces';
import type { Frame, Page, Response } from 'playwright';
import { validateAndFixSemrushStructure, buildSemrushWordCountPlan } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { markdownToSemrushHtml } from './semrush-content';
import {
  SEMRUSH_EXPAND_POLL_MS,
  SEMRUSH_RPA_TIMEOUT_MS,
  SEMRUSH_SCORE_STABLE_POLLS,
  SEMRUSH_SIDEBAR_TAB_POLL_MS,
  SEMRUSH_SWA_EDITOR_TIMEOUT_MS,
  SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
  SEMRUSH_UI_SETTLE_MS,
} from './semrush.constants';
import { pollUntil, sleep, waitForAnyLocator } from './semrush-page-wait';
import { parseChecksPayload } from './semrush-checks.parser';
import {
  dedupeActionableIssues,
  mergeActionableIntoSuggestionDetails,
  parseActionableIssuesFromSidebarText,
  synthesizeActionableFromSuggestionDetails,
} from './semrush-actionable.util';
import { hashSemrushContent } from './semrush-content-hash.util';
import {
  enrichSemrushKeywordCoverage,
  isSemrushKeywordStrictlyPresent,
  pickSemrushRecommendationsApiPayload,
} from './semrush-keyword-coverage.util';
import {
  isSemrushRecommendationsPayload,
  parseLastStatusPayload,
  parseOverallScoreRelaxed,
  parseSemrushRecommendationsPayload,
  pickBestRecommendationsCapture,
  type ParsedSemrushRecommendations,
} from './semrush-recommendations.parser';
import { SemrushSessionManager } from './semrush-session.manager';
import { SEMRUSH_SWA_SELECTORS } from './semrush.selectors';
import {
  isSemrushSpecificKeyword,
  flattenSemrushKeywordList,
  sanitizeSemrushKeywordGoal,
} from './semrush-keywords.util';
import { parseOverallScoreFromText } from './semrush-score.util';
import { filterSemrushSubmittedKeywordsInContent } from './semrush-submitted-keywords.util';

interface CapturedApiPayload {
  url: string;
  body: unknown;
}

const SECTION_LABELS: Record<keyof SemrushSuggestionDetails, string> = {
  readability: '可读性',
  seo: 'SEO',
  tone: '语气',
  originality: '原创性',
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
    let phase = 'init';

    try {
      return await this.sessionManager.withBrowser(async (context) => {
        const session = await this.sessionManager.openSemrushEditor(context, {
          preferredNodeKey: input.preferredNodeKey,
        });
        const { page, nodeKey, nodeLabel } = session;

        try {
          phase = 'goto_swa';
          await this.gotoSeoWritingAssistant(page);
          phase = 'wait_shell';
          await this.waitForCheckerShell(page);

          const apiCapture = this.setupApiCapture(page);
          let resolvedScore: number | undefined;
          try {
            phase = 'fill_and_analyze';
            resolvedScore = await this.fillAndAnalyze(
              page,
              input.keyword,
              input.content,
              apiCapture.getCaptured,
              input.recommendedKeywords,
              input.submittedKeywords,
            );
          } finally {
            apiCapture.dispose();
          }

          const captured = apiCapture.getCaptured();
          phase = 'extract_score_and_suggestions';
          const extracted = await this.extractScoreAndSuggestions(
            page,
            captured,
            nodeKey,
            nodeLabel,
            resolvedScore,
          );
          const { domUncoveredSeoKeywords, ...scoreBase } = extracted;

          phase = 'enrich_keyword_coverage';
          const apiPayload = pickSemrushRecommendationsApiPayload(captured);
          const result = enrichSemrushKeywordCoverage(scoreBase, input.content, {
            submittedKeywords:
              input.submittedKeywords ??
              [input.keyword, ...(input.recommendedKeywords ?? [])],
            targetKeyword: input.keyword,
            domUncoveredKeywords: domUncoveredSeoKeywords,
            apiPayload,
          });
          const wordPlan = buildSemrushWordCountPlan({
            content: input.content,
            competitorWordCount: result.semrushCompetitorWordCount,
            apiReportedWords: result.semrushCurrentWordCount,
          });
          if (wordPlan.reconciled) {
            this.logger.info('Semrush word count reconciled against local body', {
              action: 'semrush.word_count_reconciled',
              apiReported: wordPlan.apiReportedWords,
              local: wordPlan.localWordCount,
              effective: wordPlan.effectiveCurrentWords,
              swaGap: wordPlan.swaGap,
              localExpandTarget: wordPlan.localExpandTarget,
            });
          }
          result.semrushCurrentWordCount = wordPlan.effectiveCurrentWords;
          const contentWords = wordPlan.localWordCount;
          const contentTitle =
            input.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
            input.content.split('\n').map((line) => line.trim()).find(Boolean) ??
            '(untitled)';
          const routeMeta = `Semrush评测线路: ${nodeKey}${nodeLabel ? ` (${nodeLabel})` : ''}`;
          const contentMeta = `Semrush评测文章: ${contentTitle.slice(0, 80)} | words:${contentWords}`;
          result.semrushEvaluationRoute = routeMeta;
          result.semrushEvaluationContentFingerprint = contentMeta;
          result.semrushCheckRecord = {
            contentHash: hashSemrushContent(input.content),
            submittedKeywords:
              input.submittedKeywords ??
              [input.keyword, ...(input.recommendedKeywords ?? [])],
            nodeKey,
            checkedAt: new Date().toISOString(),
            domScore: extracted.domScore,
            apiScore: extracted.apiScore,
            currentWordCount: result.semrushCurrentWordCount,
            competitorWordCount: result.semrushCompetitorWordCount,
          };

          if (
            (result.semrushMissingTargetKeywords?.length ?? 0) > 0 ||
            (result.semrushMissingRecommendedKeywords?.length ?? 0) > 0
          ) {
            this.logger.info('Semrush SEO keyword gaps detected', {
              action: 'semrush.seo_keyword_gaps',
              missingTarget: result.semrushMissingTargetKeywords?.length ?? 0,
              missingRecommended: result.semrushMissingRecommendedKeywords?.length ?? 0,
            });
          }

          phase = 'log_completed';
          this.logger.info('Semrush RPA check completed', {
            action: 'semrush.check_score',
            keyword: input.keyword,
            overall: result.overall,
            node: nodeKey,
            analysisSource: result.analysisSource,
            readabilityScore: result.semrushReadabilityScore,
            suggestionCount: result.suggestions.length,
            apiUrlCount: result.apiUrls?.length ?? 0,
            durationMs: Date.now() - startedAt,
            route: routeMeta,
            contentFingerprint: contentMeta,
          });

          return result;
        } finally {
          await page.close().catch(() => undefined);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Semrush RPA failed', {
        action: 'semrush.check_score_failed',
        keyword: input.keyword,
        durationMs: Date.now() - startedAt,
        errorMessage: message,
        phase,
        errorStack: stack,
      });
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        `Semrush RPA 查分失败（${phase}）：${message}`,
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
    await this.sessionManager.navigateToSwaChecker(page);
  }

  /** 侧栏「设置新目标 / 关键词输入」是否已渲染（空文档无 listitem，不能等建议列表） */
  private async isSidebarGoalUiReady(page: Page): Promise<boolean> {
    if (await this.isKeywordInputVisible(page)) return true;
    return page
      .locator(SEMRUSH_SWA_SELECTORS.setNewGoals)
      .first()
      .isVisible()
      .catch(() => false);
  }

  /** checker 壳层：编辑器 + 右侧「设置新目标」异步加载，需轮询 */
  private async waitForCheckerShell(page: Page): Promise<void> {
    await waitForAnyLocator(
      page,
      (p) => p.locator(SEMRUSH_SWA_SELECTORS.editor),
      {
        timeoutMs: SEMRUSH_SWA_EDITOR_TIMEOUT_MS,
        intervalMs: SEMRUSH_EXPAND_POLL_MS,
        label: 'SWA 编辑器',
      },
    );

    if (await this.isSidebarGoalUiReady(page)) {
      await this.tryExpandNewGoals(page);
      await sleep(400);
      return;
    }

    const hasSuggestions = await page
      .locator(SEMRUSH_SWA_SELECTORS.suggestionListItem)
      .first()
      .isVisible()
      .catch(() => false);
    if (hasSuggestions) {
      await sleep(400);
      return;
    }

    await pollUntil(
      async () => {
        if (await this.isSidebarGoalUiReady(page)) return true;
        const analyzeVisible = await page
          .locator(SEMRUSH_SWA_SELECTORS.analyzeAction)
          .first()
          .isVisible()
          .catch(() => false);
        const widgetVisible = await page
          .locator(SEMRUSH_SWA_SELECTORS.checkerWidget)
          .first()
          .isVisible()
          .catch(() => false);
        return analyzeVisible || widgetVisible;
      },
      {
        timeoutMs: SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
        intervalMs: SEMRUSH_EXPAND_POLL_MS,
        label: 'SWA 右侧内容推荐区',
      },
    ).catch(() => undefined);

    await this.tryExpandNewGoals(page);
    await sleep(400);
  }

  /** 拆成独立关键词，供 SWA 标签输入（禁止整串逗号一次填入）；过滤过泛单词 */
  private collectKeywordList(primary: string, recommendedKeywords?: string[]): string[] {
    const { keywords, dropped } = sanitizeSemrushKeywordGoal(primary, recommendedKeywords);
    if (dropped.length > 0) {
      this.logger.info('Semrush keywords filtered before submit', {
        action: 'semrush.keyword_filter',
        dropped,
        kept: keywords,
        keptCount: keywords.length,
      });
    }
    return keywords;
  }

  private async fillAndAnalyze(
    page: Page,
    keyword: string,
    content: string,
    getCaptured: () => CapturedApiPayload[],
    recommendedKeywords?: string[],
    submittedKeywords?: string[],
  ): Promise<number> {
    const normalizedContent = validateAndFixSemrushStructure(content).content;
    const htmlContent = markdownToSemrushHtml(normalizedContent);

    const editor = await waitForAnyLocator(
      page,
      (p) => p.locator(SEMRUSH_SWA_SELECTORS.editor),
      { timeoutMs: SEMRUSH_SWA_EDITOR_TIMEOUT_MS, label: 'SWA 编辑器' },
    );

    await this.setupKeywordGoal(
      page,
      keyword,
      normalizedContent,
      recommendedKeywords,
      submittedKeywords,
    );
    await sleep(400);

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

    await this.triggerAnalysisIfNeeded(page);

    await sleep(1_000);
    const score = await this.waitForScore(page, getCaptured);
    await sleep(400);
    return score;
  }

  private async setupKeywordGoal(
    page: Page,
    keyword: string,
    content: string,
    recommendedKeywords?: string[],
    submittedKeywords?: string[],
  ): Promise<void> {
    const plannedRaw = flattenSemrushKeywordList(
      submittedKeywords && submittedKeywords.length > 0
        ? submittedKeywords
        : this.collectKeywordList(keyword, recommendedKeywords),
    );
    const looselyPresent = filterSemrushSubmittedKeywordsInContent(content, plannedRaw);

    // 只把「正文里连续完整出现」的词填进 Semrush 关键词框：宽松匹配（跨填充词/
    // 词形变体）会把正文里其实没有的目标词放进去。严格过滤后若不足 2 个（Semrush
    // 设目标的最低要求），回退到宽松结果，避免无法设目标导致评分流程异常。
    const strictlyPresent = looselyPresent.filter((kw) =>
      isSemrushKeywordStrictlyPresent(content, kw),
    );
    const droppedLooseKeywords = looselyPresent.filter(
      (kw) => !strictlyPresent.includes(kw),
    );
    const plannedKeywords =
      strictlyPresent.length >= 2 ? strictlyPresent : looselyPresent;

    if (droppedLooseKeywords.length > 0 && strictlyPresent.length >= 2) {
      this.logger.info('Semrush keywords dropped: not strictly present in content', {
        action: 'semrush.keyword_loose_dropped',
        dropped: droppedLooseKeywords,
        kept: plannedKeywords,
        keptCount: plannedKeywords.length,
      });
    }

    if (plannedKeywords.length === 0) {
      this.logger.warn('Semrush keyword goal skipped: no content-aligned keywords', {
        action: 'semrush.keyword_goal_empty',
        primaryKeyword: keyword,
      });
      return;
    }

    if (await this.isKeywordGoalAlreadySatisfied(page, plannedKeywords)) {
      this.logger.info('Semrush keyword goal already active, skipping setup', {
        action: 'semrush.keyword_goal_skip',
        primaryKeyword: plannedKeywords[0] ?? keyword,
        keywordCount: plannedKeywords.length,
      });
      return;
    }

    const keywords = plannedKeywords;
    const keywordInput = await this.ensureKeywordInputVisible(page);

    await this.clearExistingKeywordTags(page, keywordInput);
    await this.typeKeywordTags(keywordInput, keywords);
    await sleep(300);

    // 输完关键词标签立即去填正文：仅本地快速裁剪一次明显的泛词，
    // 不在此阶段长轮询校验、也不点「获取推荐」。关键词作为 goal 已存在，
    // 待正文填好后由 triggerAnalysisIfNeeded 统一点一次「获取推荐」触发分析，
    // 避免空正文的多余分析与两段 15s 等待。
    await this.pruneInvalidKeywordTags(page, keyword);

    this.logger.info('Semrush keyword goal set', {
      action: 'semrush.keyword_goal',
      keywords,
      keywordCount: keywords.length,
      primaryKeyword: keyword,
      recommendedCount: recommendedKeywords?.length ?? 0,
    });
  }

  /** Only skip goal setup when active SWA tags exactly match the stable target list. */
  private async isKeywordGoalAlreadySatisfied(
    page: Page,
    plannedKeywords: string[],
  ): Promise<boolean> {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const planned = plannedKeywords.map(normalize).filter(Boolean);
    if (planned.length === 0) return false;

    const active = (await this.getKeywordTagTexts(page)).map(normalize).filter(Boolean);
    if (active.length === 0 || active.length !== planned.length) return false;

    const activeSet = new Set(active);
    return planned.every((keyword) => activeSet.has(keyword));
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
          'input[placeholder*="输入以逗号分隔"], input[placeholder*="关键词"], input[placeholder*="keyword"], input[placeholder*="逗号"], [class*="SInputTags"] input, textarea[placeholder*="关键词"], textarea[placeholder*="keyword"]',
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

  /** 逐个输入关键词并以逗号/回车生成标签，避免 SWA 把整串逗号文本合并成一个标签。 */
  private async typeKeywordTags(
    keywordInput: ReturnType<Page['locator']>,
    keywords: string[],
  ): Promise<void> {
    await keywordInput.click();
    await keywordInput.fill('');

    if (keywords.length === 0) return;

    for (const kw of keywords) {
      await keywordInput.pressSequentially(kw, { delay: 12 });
      await sleep(80);
      await keywordInput.press(',');
      await sleep(120);
    }

    await keywordInput.press('Enter').catch(() => undefined);
    await sleep(150);
  }

  private keywordInputLocator(page: Page): ReturnType<Page['locator']> {
    return page.locator(SEMRUSH_SWA_SELECTORS.keywordInput).first();
  }

  private async isKeywordInputVisible(page: Page): Promise<boolean> {
    return this.keywordInputLocator(page).isVisible().catch(() => false);
  }

  private async ensureKeywordInputVisible(page: Page): Promise<ReturnType<Page['locator']>> {
    await page
      .locator(SEMRUSH_SWA_SELECTORS.checkerWidget)
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);

    await this.tryExpandNewGoals(page);
    if (await this.isKeywordInputVisible(page)) {
      return this.keywordInputLocator(page);
    }

    let lastExpandAt = Date.now();
    await pollUntil(
      async () => {
        if (await this.isKeywordInputVisible(page)) return true;
        // 节流展开点击，避免某些节点下重复点击把折叠区反复开/关。
        const now = Date.now();
        if (now - lastExpandAt >= 600) {
          lastExpandAt = now;
          await this.tryExpandNewGoals(page);
        }
        return this.isKeywordInputVisible(page);
      },
      {
        timeoutMs: SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
        intervalMs: SEMRUSH_EXPAND_POLL_MS,
        label: '关键词输入框（需展开「设置新目标」）',
      },
    );

    return this.keywordInputLocator(page);
  }

  /** 右侧「内容推荐」里关键词在折叠区；点击标题即可同步展开，无需长 settle */
  private async tryExpandNewGoals(page: Page): Promise<void> {
    if (await this.isKeywordInputVisible(page)) return;

    const setGoals = page.getByText('设置新目标', { exact: true });
    if (await setGoals.isVisible().catch(() => false)) {
      await this.clickGoalToggleIfCollapsed(setGoals);
      return;
    }

    const setGoalsEn = page.getByText('Set new goal', { exact: true });
    if (await setGoalsEn.isVisible().catch(() => false)) {
      await this.clickGoalToggleIfCollapsed(setGoalsEn);
      return;
    }

    const expanded = await page
      .evaluate(`() => {
        const labelRe = /设置新目标|Set new goal/i;
        const isGoalLabel = (raw) => {
          const text = (raw || '').replace(/\\s+/g, ' ').trim();
          if (!labelRe.test(text)) return false;
          return text.length <= 48;
        };

        const candidates = [];
        for (const el of document.querySelectorAll(
          'button, [role="button"], summary, [tabindex="0"], span, div, h3, h4',
        )) {
          const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!isGoalLabel(text)) continue;
          candidates.push({ el, len: text.length });
        }
        candidates.sort((a, b) => a.len - b.len);
        const hit = candidates[0]?.el;
        if (!hit) return false;

        const toggle =
          hit.closest('[aria-expanded]') ??
          hit.closest('button, [role="button"], summary') ??
          hit;
        if (toggle.getAttribute('aria-expanded') === 'true') return true;

        toggle.scrollIntoView({ block: 'center' });
        toggle.click();
        return true;
      }`)
      .catch(() => false);

    if (expanded) return;

    const expanders = [
      page.getByRole('button', { name: /设置新目标|Set new goal/i }),
      page.locator(SEMRUSH_SWA_SELECTORS.setNewGoals).first(),
      page.getByText(/设置新目标/),
      page.getByText(/Set new goal/i),
    ];

    for (const expander of expanders) {
      if (!(await expander.isVisible().catch(() => false))) continue;
      await this.clickGoalToggleIfCollapsed(expander);
      return;
    }
  }

  private async clickGoalToggleIfCollapsed(
    locator: ReturnType<Page['locator']>,
  ): Promise<void> {
    const expanded = await locator
      .evaluate((el) => {
        const toggle =
          el.closest('[aria-expanded]') ??
          el.closest('button, [role="button"], summary') ??
          el;
        return toggle.getAttribute('aria-expanded') === 'true';
      })
      .catch(() => false);

    if (expanded) return;

    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 5_000 }).catch(() => undefined);
  }

  private primaryKeywordKeys(primary: string): Set<string> {
    return new Set(
      primary
        .split(/[,，]/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  private async getKeywordTagTexts(page: Page): Promise<string[]> {
    const texts = await page
      .evaluate(`() => {
        const root = document.querySelector('[class*="SInputTags"]');
        if (!root) return [];
        const result = [];
        for (const btn of root.querySelectorAll(
          'button[aria-label*="Remove"], button[aria-label*="删除"], button[aria-label*="remove" i]',
        )) {
          const tag = btn.closest('[class*="Tag"]') ?? btn.parentElement;
          const text = (tag?.textContent || '')
            .replace(/[×x✕]/gi, '')
            .replace(/\\s+/g, ' ')
            .trim();
          if (text) result.push(text);
        }
        return result;
      }`)
      .catch(() => [] as string[]);
    return Array.isArray(texts) ? texts : [];
  }

  private async removeKeywordTag(page: Page, tagText: string): Promise<void> {
    await page
      .evaluate(`(target) => {
        const root = document.querySelector('[class*="SInputTags"]');
        if (!root) return;
        for (const btn of root.querySelectorAll(
          'button[aria-label*="Remove"], button[aria-label*="删除"], button[aria-label*="remove" i]',
        )) {
          const tag = btn.closest('[class*="Tag"]') ?? btn.parentElement;
          const text = (tag?.textContent || '')
            .replace(/[×x✕]/gi, '')
            .replace(/\\s+/g, ' ')
            .trim();
          if (text?.toLowerCase() === target.toLowerCase()) {
            btn.click();
            return;
          }
        }
      }`, tagText)
      .catch(() => undefined);
    await sleep(350);
  }

  /** 移除 SWA 标灰的泛词标签，直至通过「输入具体的关键词」 */
  private async pruneInvalidKeywordTags(page: Page, primary: string): Promise<void> {
    const primaryKeys = this.primaryKeywordKeys(primary);
    const tagTexts = await this.getKeywordTagTexts(page);

    for (const tag of tagTexts) {
      const isPrimary = primaryKeys.has(tag.toLowerCase());
      if (!isSemrushSpecificKeyword(tag, isPrimary)) {
        await this.removeKeywordTag(page, tag);
      }
    }
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

  /** 粘贴正文后 SWA 常自动分析；若侧栏已出「重新分析」则不再重复点击 */
  private async triggerAnalysisIfNeeded(page: Page): Promise<void> {
    await sleep(1_500);

    const analyzing = await page
      .getByText(/分析中|正在分析|Analyzing/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (analyzing) {
      this.logger.info('Semrush analysis already in progress after paste', {
        action: 'semrush.analyze_skip',
        reason: 'in_progress',
      });
      return;
    }

    const hasReAnalyze = await page
      .locator(SEMRUSH_SWA_SELECTORS.reAnalyze)
      .first()
      .isVisible()
      .catch(() => false);
    const suggestionCount = await this.countSidebarSuggestions(page);
    const domScore = this.resolveScore(await this.tryReadScore(page));

    if (hasReAnalyze && suggestionCount >= 2 && domScore !== null) {
      this.logger.info('Semrush analysis already complete after paste', {
        action: 'semrush.analyze_skip',
        reason: 'sidebar_ready',
        score: domScore,
        suggestionCount,
      });
      return;
    }

    await this.clickAnalyzeButton(page);
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
    const startedAt = Date.now();
    let lastSnippet = '';
    let stableCount = 0;
    let lastMerged: number | null = null;

    while (Date.now() < deadline) {
      const analysisComplete = await this.isAnalysisComplete(page);
      const suggestionCount = analysisComplete
        ? await this.countSidebarSuggestions(page)
        : 0;
      const domScore = this.resolveScore(await this.tryReadScore(page));
      const fetchBudget = analysisComplete ? 3_000 : 1_500;
      const fetched = await this.fetchRecommendationsWhenReady(page, fetchBudget);
      const apiScore = this.resolveScore(
        fetched?.overall ??
          pickBestRecommendationsCapture(getCaptured())?.overall ??
          this.tryReadScoreFromCaptured(getCaptured()) ??
          this.tryReadScoreFromApi(getCaptured()),
      );
      const mergedScore = this.pickOverallScore(domScore, apiScore, 'waitForScore');
      const pollsRequired =
        analysisComplete && suggestionCount >= 2 && mergedScore !== null
          ? 1
          : stablePollsRequired;

      if (mergedScore !== null && analysisComplete) {
        if (lastMerged !== null && Math.abs(mergedScore - lastMerged) < 0.05) {
          stableCount += 1;
        } else {
          stableCount = 1;
        }
        lastMerged = mergedScore;

        if (stableCount >= pollsRequired) {
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
            suggestionCount,
            source: finalDomScore !== null ? 'dom' : domScore !== null ? 'dom' : 'api',
          });
          return finalScore;
        }
      } else {
        stableCount = 0;
        lastMerged = null;
      }

      if (
        analysisComplete &&
        suggestionCount >= 2 &&
        mergedScore === null &&
        Date.now() - startedAt > 40_000
      ) {
        const forced = await this.fetchRecommendationsWhenReady(page, 10_000);
        const forcedScore = this.resolveScore(
          forced?.overall ?? this.tryReadScoreFromCaptured(getCaptured()),
        );
        if (forcedScore !== null) {
          this.logger.info('Semrush score resolved via forced API fetch', {
            action: 'semrush.score_forced',
            score: forcedScore,
            suggestionCount,
          });
          return forcedScore;
        }
      }

      lastSnippet = await page
        .locator('body')
        .innerText()
        .then((t) => t.replace(/\s+/g, ' ').slice(0, 200))
        .catch(() => '');

      await sleep(analysisComplete ? 800 : 1_500);
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

  /** 侧栏 DOM 为权威来源；API 偶发返回占位满分 10 */
  private pickOverallScore(
    domScore: number | null,
    apiScore: number | null,
    context: string,
  ): number | null {
    if (domScore !== null) {
      if (apiScore !== null && Math.abs(domScore - apiScore) >= 0.5) {
        this.logger.warn('Semrush score mismatch, preferring DOM', {
          action: 'semrush.score_mismatch',
          context,
          domScore,
          apiScore,
        });
      }
      return domScore;
    }
    return apiScore;
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
    const widgetSnippet = await page
      .evaluate(`() => {
        const widget = document.querySelector('[data-test="swa-spa-checker-widget"]');
        if (!widget) return null;

        for (const el of widget.querySelectorAll('*')) {
          const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (text.length < 4 || text.length > 80) continue;
          if (/极佳|优秀|良好|Overall|\\/\\s*10|文章质量/i.test(text)) {
            return text;
          }
        }

        for (const el of widget.querySelectorAll('[aria-label]')) {
          const label = (el.getAttribute('aria-label') || '').trim();
          if (/极佳|Overall|\\/\\s*10|score/i.test(label)) {
            return label;
          }
        }

        return (widget.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400);
      }`)
      .catch(() => null);

    if (typeof widgetSnippet === 'string' && widgetSnippet.length > 0) {
      const fromWidget = parseOverallScoreFromText(widgetSnippet);
      if (fromWidget !== null) return fromWidget;
    }

    const bodyText = await page.locator('body').innerText().catch(() => '');
    return parseOverallScoreFromText(bodyText);
  }

  private tryReadScoreFromApi(captured: CapturedApiPayload[]): number | null {
    return pickBestRecommendationsCapture(captured)?.overall ?? null;
  }

  /** data_ready 未置 true 时仍尝试从 recommendations 响应读分 */
  private tryReadScoreFromCaptured(captured: CapturedApiPayload[]): number | null {
    for (let i = captured.length - 1; i >= 0; i -= 1) {
      const body = captured[i]?.body;
      if (!isSemrushRecommendationsPayload(body)) continue;
      const relaxed = parseOverallScoreRelaxed(body);
      if (relaxed !== undefined) return relaxed;
    }
    return null;
  }

  private async countSidebarSuggestions(page: Page): Promise<number> {
    return page.locator(SEMRUSH_SWA_SELECTORS.suggestionListItem).count().catch(() => 0);
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

    if (pickBestRecommendationsCapture(captured)) {
      return {};
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
          const relaxed = parseOverallScoreRelaxed(body);
          if (relaxed !== undefined) {
            return { ...parsed, overall: relaxed };
          }
        }
      } catch {
        /* 网络抖动时继续轮询 */
      }
      await sleep(timeoutMs <= 3_000 ? 600 : 1_200);
    }

    return lastParsed;
  }

  private async extractScoreAndSuggestions(
    page: Page,
    captured: CapturedApiPayload[],
    nodeKey: string,
    nodeLabel: string,
    resolvedScore?: number,
  ): Promise<
    SeoScore & {
      domUncoveredSeoKeywords?: string[];
      domScore?: number;
      apiScore?: number;
    }
  > {
    const apiCaptured = pickBestRecommendationsCapture(captured);
    const apiPrefetched =
      apiCaptured ??
      (await this.fetchRecommendationsWhenReady(
        page,
        resolvedScore !== undefined ? 2_500 : 4_000,
      ));
    const domScore = this.resolveScore(
      (await this.tryReadScore(page)) ?? resolvedScore,
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

    const sidebarCollectStartedAt = Date.now();
    let sidebarPrepareMs = 0;
    let sidebarApiMs = 0;
    let sidebarDomMs = 0;

    this.logger.info('Semrush collecting sidebar suggestions', {
      action: 'semrush.sidebar_collect_start',
      overall,
      hasCapturedApi: Boolean(apiCaptured),
    });

    const prepareStartedAt = Date.now();
    await page
      .locator(SEMRUSH_SWA_SELECTORS.checkerWidget)
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => undefined);

    const sidebarAlreadyReady =
      (await page
        .locator(SEMRUSH_SWA_SELECTORS.suggestionListItem)
        .count()
        .catch(() => 0)) > 0;

    if (!sidebarAlreadyReady) {
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
          return listItemCount > 0 || widgetVisible;
        },
        { timeoutMs: 8_000, intervalMs: 500, label: 'Semrush 侧栏就绪' },
      ).catch(() => undefined);
    }
    sidebarPrepareMs = Date.now() - prepareStartedAt;

    const apiStartedAt = Date.now();
    const apiFetched =
      apiCaptured ??
      apiPrefetched ??
      (await this.fetchRecommendationsWhenReady(page, 2_500));

    const [lastStatusDetails, checksDetails] = await Promise.all([
      this.fetchLastStatusSuggestions(page).then((d) =>
        this.normalizeSuggestionDetails(d),
      ),
      this.fetchChecksSuggestions(page, captured).then((d) =>
        this.normalizeSuggestionDetails(d),
      ),
    ]);
    sidebarApiMs = Date.now() - apiStartedAt;
    const apiDetails = this.normalizeSuggestionDetails(
      this.mergeSuggestionDetails(
        this.mergeSuggestionDetails(apiFetched?.details, apiCaptured?.details),
        this.mergeSuggestionDetails(lastStatusDetails, checksDetails),
      ),
    );

    const domStartedAt = Date.now();
    const domExtracted = await this.extractSuggestionsFromDom(page);
    sidebarDomMs = Date.now() - domStartedAt;
    const domDetails = this.normalizeSuggestionDetails(domExtracted.details);
    const domActionable = domExtracted.actionableIssues;

    this.logger.info('Semrush sidebar collection finished', {
      action: 'semrush.sidebar_collect_done',
      elapsedMs: Date.now() - sidebarCollectStartedAt,
      prepareMs: sidebarPrepareMs,
      apiMs: sidebarApiMs,
      domMs: sidebarDomMs,
      hasApi: this.hasAnySuggestions(apiDetails),
      hasDom: this.hasAnySuggestions(domDetails),
      actionableCount: domActionable.length,
    });

    if (domActionable.length === 0) {
      const sidebarSnippet = await page
        .locator(SEMRUSH_SWA_SELECTORS.checkerWidget)
        .first()
        .innerText()
        .catch(() => '');
      this.logger.info('Semrush DOM actionable empty after sidebar expand', {
        action: 'semrush.actionable_empty',
        domSuggestionKeys: Object.keys(domDetails),
        hasPassiveHeader: /主动语态|active voice/i.test(sidebarSnippet),
        hasCasualHeader: /随意|casual sentence/i.test(sidebarSnippet),
        snippet: sidebarSnippet.slice(0, 800),
      });
    }

    if (process.env.SEMRUSH_DEBUG_SIDEBAR === '1') {
      await this.dumpSidebarDebug(page, { apiDetails, domDetails }).catch(() => undefined);
    }

    let suggestionDetails = this.mergeSuggestionDetails(domDetails, apiDetails);
    let actionableIssues =
      domActionable.length > 0 ? dedupeActionableIssues(domActionable) : undefined;

    if (!actionableIssues?.length) {
      const synthesized = synthesizeActionableFromSuggestionDetails(suggestionDetails);
      if (synthesized.length > 0) {
        actionableIssues = synthesized;
        this.logger.info('Semrush actionable synthesized from suggestion labels', {
          action: 'semrush.actionable_synthesized',
          count: synthesized.length,
          rules: synthesized.map((i) => i.rule),
        });
      }
    } else {
      const synthesized = synthesizeActionableFromSuggestionDetails(suggestionDetails);
      const coveredRules = new Set(actionableIssues.map((i) => i.rule));
      const extras = synthesized.filter((i) => !coveredRules.has(i.rule));
      if (extras.length > 0) {
        actionableIssues = dedupeActionableIssues([...actionableIssues, ...extras]);
      }
    }

    if (actionableIssues && actionableIssues.length > 0) {
      suggestionDetails = mergeActionableIntoSuggestionDetails(suggestionDetails, actionableIssues);
    }

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
    const semrushTargetKeywords = this.collectSemrushTargetKeywords(
      apiPrefetched,
      apiFetched,
      captured,
    );

    const finalDomScore = this.resolveScore(await this.tryReadScore(page));
    const finalApiScore = this.resolveScore(
      apiFetched?.overall ?? apiPrefetched?.overall ?? apiCaptured?.overall,
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
      semrushTargetKeywords,
      semrushCompetitorWordCount: metricsSource?.competitorWordCount,
      semrushCurrentWordCount: metricsSource?.currentWordCount,
      semrushReadabilityScore: metricsSource?.readabilityScore,
      node: nodeKey,
      nodeLabel,
      suggestionDetails,
      actionableIssues,
      analysisSource,
      apiUrls: apiUrls.length > 0 ? apiUrls : undefined,
      domUncoveredSeoKeywords: domExtracted.domUncoveredSeoKeywords,
      domScore: finalDomScore ?? domScore ?? undefined,
      apiScore: finalApiScore ?? apiScore ?? undefined,
    };
  }

  private collectSemrushTargetKeywords(
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
          for (const kw of parsed.targetKeywords ?? []) push(kw);
        }
        continue;
      }
      for (const kw of source.targetKeywords ?? []) push(kw);
    }

    return merged.length > 0 ? merged.slice(0, 30) : undefined;
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

    return merged.length > 0 ? merged : undefined;
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

  /** 点击侧栏维度 Tab（中英只点第一个可见项，避免重复轮询） */
  private async clickSidebarDimensionTab(
    widget: ReturnType<Page['locator']>,
    labels: string[],
  ): Promise<boolean> {
    for (const label of labels) {
      const tab = widget
        .locator(`[role="tab"]:has-text("${label}"), button:has-text("${label}")`)
        .first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click({ timeout: 2_500 }).catch(() => undefined);
        return true;
      }
      const hit = widget.getByText(label, { exact: true }).first();
      if (await hit.isVisible().catch(() => false)) {
        await hit.click({ timeout: 2_500 }).catch(() => undefined);
        return true;
      }
    }
    return false;
  }

  /**
   * 展开当前激活 Tab 内的折叠原句（被动语态/复杂词/随意句）与全部「展示更多」。
   * 全程用 widget.evaluate 批量点击，避免逐个 Playwright 点击 + sleep 的累计耗时。
   */
  private async expandCurrentTabRows(
    widget: ReturnType<Page['locator']>,
  ): Promise<void> {
    const issueRowPatternSources = [
      '考虑使用主动语态|Consider using active voice',
      '最为随意|随意句子|casual sentence',
      '复杂词语|complex word',
      '填充词|filler',
      '拆分长段|long paragraph',
      '难以阅读|hard to read',
      '重写难以阅读|Rewrite hard-to-read',
    ];
    await widget
      .evaluate(
        `(patterns) => {
          const widgetEl = document.querySelector('[data-test="swa-spa-checker-widget"]');
          if (!widgetEl) return;
          const safePatterns = Array.isArray(patterns) ? patterns : [];
          const reList = safePatterns.map((p) => new RegExp(p, 'i'));

          const activePanel = widgetEl;

          const clickExpandables = (root) => {
            for (const btn of root.querySelectorAll('button[aria-expanded="false"]')) {
              btn.click();
            }
          };

          clickExpandables(activePanel);
          for (const section of activePanel.querySelectorAll('section[aria-labelledby]')) {
            clickExpandables(section);
          }
          for (const item of activePanel.querySelectorAll('[role="listitem"]')) {
            const text = (item.textContent || '').replace(/\\s+/g, ' ').trim();
            if (text.length > 120) continue;
            if (!reList.some((re) => re.test(text))) continue;
            const btn = item.querySelector('button[aria-expanded="false"]');
            if (btn) btn.click();
            else item.click();
          }
        }`,
        issueRowPatternSources,
      )
      .catch(() => undefined);
    await sleep(SEMRUSH_EXPAND_POLL_MS);

    for (let round = 0; round < 2; round += 1) {
      const clicked = await widget
        .evaluate(`() => {
          const widgetEl = document.querySelector('[data-test="swa-spa-checker-widget"]');
          if (!widgetEl) return 0;
          let n = 0;
          const isShowMore = (text) => /^(展示更多|Show more)$/i.test((text || '').trim());
          for (const el of widgetEl.querySelectorAll('button, a, [role="button"]')) {
            if (!isShowMore(el.textContent)) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            el.click();
            n += 1;
            if (n >= 8) break;
          }
          return n;
        }`)
        .catch(() => 0);
      if (!clicked) break;
      await sleep(SEMRUSH_EXPAND_POLL_MS);
    }
  }

  private async readSidebarWidgetText(
    widget: ReturnType<Page['locator']>,
  ): Promise<string> {
    const text = await widget
      .evaluate(`() => {
        const el = document.querySelector('[data-test="swa-spa-checker-widget"]');
        return el ? (el.innerText || el.textContent || '') : '';
      }`)
      .catch(() => '');
    return typeof text === 'string' ? text : '';
  }

  private async extractSuggestionsFromDom(
    page: Page,
  ): Promise<{
    details: SemrushSuggestionDetails;
    actionableIssues: SemrushActionableIssue[];
    domUncoveredSeoKeywords?: string[];
  }> {
    let mergedDetails: SemrushSuggestionDetails = {};
    let mergedActionable: SemrushActionableIssue[] = [];
    const widget = page.locator(SEMRUSH_SWA_SELECTORS.checkerWidget).first();

    const dimensionTabGroups = [
      ['可读性', 'Readability'],
      ['语气', 'Tone'],
      ['SEO'],
    ];

    let domUncoveredSeoKeywords: string[] = [];

    const mergePartial = async () => {
      const hasQuoteActionable = (rule: string) =>
        mergedActionable.some((i) => i.rule === rule && (i.quotes?.length ?? 0) > 0);
      if (
        hasQuoteActionable('passive_voice') &&
        hasQuoteActionable('casual_sentence') &&
        this.hasAnySuggestions(mergedDetails)
      ) {
        return;
      }

      const tryFrame = async (frame: Frame) => {
        try {
          const partial = await this.extractSuggestionsFromFrame(frame);
          mergedDetails = this.mergeSuggestionDetails(mergedDetails, partial.details);
          mergedActionable.push(...partial.actionableIssues);
        } catch {
          /* cross-origin or detached frame */
        }
      };

      await tryFrame(page.mainFrame());
      if (this.hasAnySuggestions(mergedDetails) && mergedActionable.length > 0) {
        return;
      }

      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const url = frame.url();
        if (url && !/sem\.3ue\.com|semrush\.com/i.test(url)) continue;
        await tryFrame(frame);
      }
    };

    const applySidebarText = (sidebarText: string) => {
      if (!sidebarText) return;
      const parsedFromText = parseActionableIssuesFromSidebarText(sidebarText);
      mergedActionable.push(...parsedFromText);
      for (const issue of parsedFromText) {
        if (issue.rule === 'casual_sentence' && issue.quotes?.length) {
          mergedDetails.tone = [
            ...new Set([...(mergedDetails.tone ?? []), ...issue.quotes]),
          ].slice(0, 30);
        }
        if (issue.rule === 'passive_voice' && issue.quotes?.length) {
          mergedDetails.readability = [
            ...new Set([...(mergedDetails.readability ?? []), ...issue.quotes]),
          ].slice(0, 30);
        }
      }
    };

    if (!(await widget.isVisible().catch(() => false))) {
      return { details: {}, actionableIssues: [] };
    }

    for (const labels of dimensionTabGroups) {
      const tabClicked = await this.clickSidebarDimensionTab(widget, labels);
      if (!tabClicked) continue;

      await sleep(SEMRUSH_EXPAND_POLL_MS);

      if (labels[0] === 'SEO') {
        const uncovered = await this.scrapeUncoveredSeoTags(widget);
        if (uncovered.length > 0) {
          domUncoveredSeoKeywords = [
            ...new Set([...domUncoveredSeoKeywords, ...uncovered]),
          ];
        }
        applySidebarText(
          await widget.innerText({ timeout: 5_000 }).catch(() => ''),
        );
        continue;
      }

      // 可读性/语气：短轮询等原句列表渲染，再批量展开
      await pollUntil(
        async () => {
          const text = await this.readSidebarWidgetText(widget);
          return /主动语态|active voice|随意|casual sentence|可读性|Readability|语气|Tone/i.test(
            text,
          );
        },
        {
          timeoutMs: SEMRUSH_SIDEBAR_TAB_POLL_MS,
          intervalMs: SEMRUSH_EXPAND_POLL_MS,
          label: `SWA ${labels[0]} tab content`,
        },
      ).catch(() => undefined);

      await this.expandCurrentTabRows(widget);
      await sleep(1_200);
      applySidebarText(
        await widget.innerText({ timeout: 8_000 }).catch(() => ''),
      );
    }

    await mergePartial();

    if (process.env.SEMRUSH_DEBUG_SIDEBAR === '1' && !this.hasAnySuggestions(mergedDetails)) {
      this.logger.info('Semrush DOM extract empty after all frames', {
        action: 'semrush.dom_extract_empty',
        frameCount: page.frames().length,
      });
    }

    return {
      details: this.normalizeSuggestionDetails(mergedDetails),
      actionableIssues: dedupeActionableIssues(mergedActionable),
      domUncoveredSeoKeywords:
        domUncoveredSeoKeywords.length > 0 ? domUncoveredSeoKeywords : undefined,
    };
  }

  /** SEO Tab：灰色 Tag = 正文未覆盖（绿 Tag 为已覆盖） */
  private async scrapeUncoveredSeoTags(
    widget: ReturnType<Page['locator']>,
  ): Promise<string[]> {
    const tagsRaw = await widget
      .evaluate(`() => {
        const widgetEl = document.querySelector('[data-test="swa-spa-checker-widget"]');
        if (!widgetEl) return [];
        const uncovered = [];
        for (const tag of widgetEl.querySelectorAll('[data-ui-name="Tag"]')) {
          const text = tag.querySelector('[data-ui-name="Tag.Text"]')?.textContent?.trim();
          if (!text || text.length < 2) continue;
          const style = window.getComputedStyle(tag);
          const bg = style.backgroundColor || '';
          const rgb = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
          let isCovered = false;
          if (rgb) {
            const r = Number(rgb[1]);
            const g = Number(rgb[2]);
            const b = Number(rgb[3]);
            isCovered = g > 110 && g > r + 15 && g > b + 15;
          }
          if (!isCovered) uncovered.push(text);
        }
        return uncovered;
      }`)
      .catch(() => []);

    const tags = Array.isArray(tagsRaw) ? (tagsRaw as string[]) : [];

    return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  }

  private async extractSuggestionsFromFrame(frame: Frame): Promise<{
    details: SemrushSuggestionDetails;
    actionableIssues: SemrushActionableIssue[];
  }> {
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

      const classifyRule = (label) => {
        if (/主动语态|active voice/i.test(label)) return 'passive_voice';
        if (/复杂|complex word/i.test(label)) return 'complex_word';
        if (/随意|casual sentence/i.test(label)) return 'casual_sentence';
        if (/移除或替换|填充|filler/i.test(label)) return 'filler_phrase';
        if (/段落|paragraph|拆分长段/i.test(label)) return 'long_paragraph';
        if (/关键词|keyword/i.test(label)) return 'keyword';
        return 'other';
      };

      const isEnglishQuote = (text) =>
        /^[A-Za-z][A-Za-z0-9\\s,'"()-]{10,320}[.!?]?$/.test(text.trim());

      const extractNumberedUnderHeader = (headerRe, maxItems = 20) => {
        const rawText = widget.innerText || widget.textContent || '';
        const idx = rawText.search(headerRe);
        if (idx < 0) return [];
        const slice = rawText.slice(idx, idx + 8000);
        const quotes = [];

        const pushQuote = (text) => {
          const q = normalize(text);
          if (isEnglishQuote(q)) quotes.push(q);
        };

        for (const m of slice.matchAll(/\\d+\\.\\s*([A-Za-z][^\\n]{8,320}?[.!?])/g)) {
          pushQuote(m[1]);
        }
        for (const m of slice.matchAll(/(?:^|\\n)\\s*\\d+\\s*\\n\\s*([A-Za-z][^\\n]{8,320}?[.!?])/gm)) {
          pushQuote(m[1]);
        }

        const normalizedSlice = normalize(slice);
        for (const m of normalizedSlice.matchAll(/\\b\\d+\\s+([A-Za-z][^.!?]{8,280}[.!?])/g)) {
          pushQuote(m[1]);
        }

        return [...new Set(quotes)].slice(0, maxItems);
      };

      const actionable = [];

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

        const topItems = [...section.querySelectorAll(':scope [role="list"] > [role="listitem"]')];
        for (const item of topItems) {
          const label = normalize(
            item.querySelector('[data-ui-name="Box"]')?.textContent?.split('\\n')[0] ||
              item.textContent?.split('\\n')[0],
          );
          if (!label || label.length < 4) continue;

          const terms = [...item.querySelectorAll('[data-ui-name="Tag.Text"]')]
            .map((tag) => normalize(tag.textContent))
            .filter(Boolean);

          const subQuotes = [...item.querySelectorAll(':scope [role="list"] [role="listitem"]')]
            .map(extractListItemText)
            .filter((t) => isEnglishQuote(t));

          const inlineNumbered = [
            ...normalize(item.innerText || '').matchAll(/\\d+\\.\\s*([A-Za-z][^.!?\\n]{8,280}[.!?]?)/g),
          ]
            .map((m) => normalize(m[1]))
            .filter((t) => isEnglishQuote(t));

          const quotes = [...new Set([...subQuotes, ...inlineNumbered])];
          const rule = classifyRule(label);

          if (quotes.length > 0 || terms.length > 0) {
            actionable.push({
              category: targetKey,
              rule,
              label,
              quotes: quotes.length > 0 ? quotes : undefined,
              terms: terms.length > 0 ? terms : undefined,
            });
          } else if (
            rule !== 'other' &&
            rule !== 'keyword' &&
            /考虑|重写|替换|移除|Consider|Rewrite|Replace|Remove/i.test(label)
          ) {
            actionable.push({
              category: targetKey,
              rule,
              label,
            });
          }
        }
      }

      const headerRules = [
        { re: /最为随意的句子|Most casual sentences/i, rule: 'casual_sentence', category: 'tone' },
        { re: /考虑使用主动语态|Consider using active voice/i, rule: 'passive_voice', category: 'readability' },
        { re: /考虑移除或替换|Consider removing or replacing/i, rule: 'filler_phrase', category: 'tone' },
        { re: /替换太过复杂的词语|Replace overly complex words/i, rule: 'complex_word', category: 'readability' },
      ];

      for (const { re, rule, category } of headerRules) {
        const quotes = extractNumberedUnderHeader(re, 24);
        if (quotes.length === 0) continue;
        const labelMatch = normalize(widget.innerText || '').match(re);
        actionable.push({
          category,
          rule,
          label: labelMatch ? labelMatch[0] : rule,
          quotes,
        });
      }

      const hasStructured = Object.values(details).some((items) => items?.length > 0);

      const casualSentences = extractNumberedUnderHeader(/最为随意的句子|Most casual sentences/i, 24);
      if (casualSentences.length > 0) {
        details.tone = [...new Set([...(details.tone ?? []), ...casualSentences])].slice(0, 30);
      }

      const passiveQuotes = extractNumberedUnderHeader(
        /考虑使用主动语态|Consider using active voice/i,
        16,
      );
      if (passiveQuotes.length > 0) {
        details.readability = [
          ...new Set([...(details.readability ?? []), ...passiveQuotes]),
        ].slice(0, 30);
      }

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

      return { details, actionable };
    }`)) as { details: SemrushSuggestionDetails; actionable: SemrushActionableIssue[] };

    return {
      details: this.normalizeSuggestionDetails(raw.details ?? {}),
      actionableIssues: dedupeActionableIssues(raw.actionable ?? []),
    };
  }
}
