/**
 * Semrush SEO Writing Assistant RPA：经 3ue 共享号自动查分。
 */

import { Injectable } from '@nestjs/common';
import type {
  ISeoCheckerProvider,
  SeoCheckInput,
  SeoScore,
} from '@wm/provider-interfaces';
import type { Page, Response } from 'playwright';
import { validateAndFixSemrushStructure, buildSemrushWordCountPlan } from '@wm/shared-core';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { markdownToSemrushHtml } from './semrush-content';
import {
  SEMRUSH_EXPAND_POLL_MS,
  SEMRUSH_RPA_TIMEOUT_MS,
  SEMRUSH_SCORE_STABLE_POLLS,
  SEMRUSH_SWA_EDITOR_TIMEOUT_MS,
  SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
  SEMRUSH_UI_SETTLE_MS,
} from './semrush.constants';
import { pollUntil, sleep, waitForAnyLocator } from './semrush-page-wait';
import {
  dedupeActionableIssues,
  mergeActionableIntoSuggestionDetails,
  synthesizeActionableFromSuggestionDetails,
} from './semrush-actionable.util';
import { hashSemrushContent } from './semrush-content-hash.util';
import {
  enrichSemrushKeywordCoverage,
  pickSemrushRecommendationsApiPayload,
} from './semrush-keyword-coverage.util';
import {
  isSemrushRecommendationsPayload,
  parseSemrushRecommendationsPayload,
  pickBestRecommendationsCapture,
  type ParsedSemrushRecommendations,
} from './semrush-recommendations.parser';
import { SemrushSessionManager } from './semrush-session.manager';
import { semrushAbortContext } from './semrush-work-abort.context';
import { SemrushWorkAbortService } from './semrush-work-abort.service';
import {
  createSemrushAbortedException,
  toSemrushAbortedIfNeeded,
} from './semrush-work-abort.util';
import { SEMRUSH_SWA_SELECTORS } from './semrush.selectors';
import { setupSemrushKeywordGoal, tryExpandSemrushNewGoals, isSemrushKeywordInputVisible } from './semrush-rpa-keyword-goal.util';

import {
  pickSemrushOverallScore,
  resolveSemrushScore,
  tryReadSemrushScoreFromApi,
  tryReadSemrushScoreFromCaptured,
  tryReadSemrushScoreFromDom,
  type CapturedApiPayload,
} from './semrush-rpa-score.util';
import {
  flattenSemrushSuggestions,
  hasAnySemrushSuggestions,
  mergeSemrushSuggestionDetails,
  normalizeSemrushSuggestionDetails,
} from './semrush-rpa-suggestion-details.util';
import {
  buildSemrushLastStatusApiUrl,
  buildSemrushRecommendationsApiUrl,
  fetchSemrushChecksSuggestions,
  fetchSemrushLastStatusSuggestions,
  fetchSemrushRecommendationsWhenReady,
} from './semrush-rpa-sidebar-api.util';
import {
  countSemrushSidebarSuggestions,
  dumpSemrushSidebarDebug,
  extractSemrushSuggestionsFromDom,
} from './semrush-rpa-sidebar-dom.util';

@Injectable()
export class SemrushRpaAdapter implements ISeoCheckerProvider {
  constructor(
    private readonly sessionManager: SemrushSessionManager,
    private readonly abortService: SemrushWorkAbortService,
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

    const articleJobId = input.articleJobId?.trim() || undefined;
    const execute = () => this.executeCheckScore(input, articleJobId);
    if (!articleJobId) {
      return execute();
    }

    return semrushAbortContext.run(
      {
        articleJobId,
        shouldAbort: () => this.abortService.shouldAbort(articleJobId),
      },
      execute,
    );
  }

  private async executeCheckScore(
    input: SeoCheckInput,
    articleJobId: string | undefined,
  ): Promise<SeoScore> {
    const abortState = { context: null as import('playwright').BrowserContext | null, aborted: false };

    if (articleJobId) {
      this.abortService.register(articleJobId, {
        abort: async () => {
          abortState.aborted = true;
          await abortState.context?.close().catch(() => undefined);
        },
      });
    }

    const startedAt = Date.now();
    let phase = 'init';

    try {
      return await this.sessionManager.withBrowser(async (context) => {
        abortState.context = context;
        if (abortState.aborted) {
          throw createSemrushAbortedException('任务已暂停，Semrush 检测已取消');
        }

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
      const aborted = toSemrushAbortedIfNeeded(error, '任务已暂停，Semrush 检测已取消');
      if (aborted) {
        this.logger.info('Semrush RPA aborted', {
          action: 'semrush.check_score_aborted',
          keyword: input.keyword,
          articleJobId,
          durationMs: Date.now() - startedAt,
          reason: aborted.message,
        });
        throw aborted;
      }

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
    } finally {
      if (articleJobId) {
        this.abortService.unregister(articleJobId);
      }
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
    if (await isSemrushKeywordInputVisible(page)) return true;
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
      await tryExpandSemrushNewGoals(page);
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

    await tryExpandSemrushNewGoals(page);
    await sleep(400);
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

    await setupSemrushKeywordGoal(
      page,
      keyword,
      normalizedContent,
      this.logger,
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
    const suggestionCount = await countSemrushSidebarSuggestions(page);
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
        ? await countSemrushSidebarSuggestions(page)
        : 0;
      const domScore = this.resolveScore(await this.tryReadScore(page));
      const fetchBudget = analysisComplete ? 3_000 : 1_500;
      const fetched = await fetchSemrushRecommendationsWhenReady(page, fetchBudget);
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
        const forced = await fetchSemrushRecommendationsWhenReady(page, 10_000);
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

  private resolveScore(raw: number | null | undefined): number | null {
    return resolveSemrushScore(raw);
  }

  private pickOverallScore(
    domScore: number | null,
    apiScore: number | null,
    context: string,
  ): number | null {
    return pickSemrushOverallScore(domScore, apiScore, context, (payload) => {
      this.logger.warn('Semrush score mismatch, preferring DOM', {
        action: 'semrush.score_mismatch',
        ...payload,
      });
    });
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
    return tryReadSemrushScoreFromDom(page);
  }

  private tryReadScoreFromApi(captured: CapturedApiPayload[]): number | null {
    return tryReadSemrushScoreFromApi(captured);
  }

  private tryReadScoreFromCaptured(captured: CapturedApiPayload[]): number | null {
    return tryReadSemrushScoreFromCaptured(captured);
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
      (await fetchSemrushRecommendationsWhenReady(
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
      (await fetchSemrushRecommendationsWhenReady(page, 2_500));

    const [lastStatusDetails, checksDetails] = await Promise.all([
      fetchSemrushLastStatusSuggestions(page).then((d) =>
        normalizeSemrushSuggestionDetails(d),
      ),
      fetchSemrushChecksSuggestions(page, captured, ({ url, count }) => {
        this.logger.info('Semrush checks API parsed', {
          action: 'semrush.checks_api',
          url,
          count,
        });
      }).then((d) => normalizeSemrushSuggestionDetails(d)),
    ]);
    sidebarApiMs = Date.now() - apiStartedAt;
    const apiDetails = normalizeSemrushSuggestionDetails(
      mergeSemrushSuggestionDetails(
        mergeSemrushSuggestionDetails(apiFetched?.details, apiCaptured?.details),
        mergeSemrushSuggestionDetails(lastStatusDetails, checksDetails),
      ),
    );

    const domStartedAt = Date.now();
    const domExtracted = await extractSemrushSuggestionsFromDom(page, {
      logger: this.logger,
    });
    sidebarDomMs = Date.now() - domStartedAt;
    const domDetails = normalizeSemrushSuggestionDetails(domExtracted.details);
    const domActionable = domExtracted.actionableIssues;

    this.logger.info('Semrush sidebar collection finished', {
      action: 'semrush.sidebar_collect_done',
      elapsedMs: Date.now() - sidebarCollectStartedAt,
      prepareMs: sidebarPrepareMs,
      apiMs: sidebarApiMs,
      domMs: sidebarDomMs,
      hasApi: hasAnySemrushSuggestions(apiDetails),
      hasDom: hasAnySemrushSuggestions(domDetails),
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
      await dumpSemrushSidebarDebug(page, { apiDetails, domDetails }, this.logger).catch(
        () => undefined,
      );
    }

    let suggestionDetails = mergeSemrushSuggestionDetails(domDetails, apiDetails);
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
    const hasApi = hasAnySemrushSuggestions(apiDetails);
    const hasDom = hasAnySemrushSuggestions(domDetails);
    if (hasApi && hasDom) {
      analysisSource = 'mixed';
    } else if (hasApi) {
      analysisSource = 'api';
    } else {
      analysisSource = 'dom';
    }

    const recommendationsApiUrl = buildSemrushRecommendationsApiUrl(page);
    const lastStatusApiUrl = buildSemrushLastStatusApiUrl(page);
    const apiUrls = [
      ...new Set([
        ...captured.map((c) => c.url),
        ...(recommendationsApiUrl ? [recommendationsApiUrl] : []),
        ...(lastStatusApiUrl ? [lastStatusApiUrl] : []),
      ]),
    ];

    const suggestions = flattenSemrushSuggestions(suggestionDetails);

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

}
