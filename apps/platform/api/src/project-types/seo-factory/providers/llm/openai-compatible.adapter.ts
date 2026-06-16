/**
 * OpenAI 兼容 LLM 适配器：通过环境变量接入 DeepSeek / PackyAPI / OpenAI 等。
 *
 * 边界：
 * - 不负责：Prompt 文件管理（由 PromptLoaderService 加载）
 *
 * 入口：
 * - OpenAiCompatibleAdapter
 */

import { Injectable } from '@nestjs/common';
import {
  defaultBrandVoice,
  getContentLanguageLabel,
  LOCAL_SEO_PASS_THRESHOLD,
  normalizeContentLanguage,
  parseLlmJson,
  LlmJsonParseError,
} from '@wm/shared-core';
import type {
  BriefInput,
  BriefOutput,
  DraftInput,
  DraftOutput,
  ILLMProvider,
  KeywordSeedInput,
  KeywordSeedOutput,
  OptimizeInput,
  OptimizeOutput,
  ParaphraseInput,
  ParaphraseOutput,
  ParaphraseValidateInput,
  ParaphraseValidateOutput,
  RewriteInput,
  RewriteOutput,
} from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { PromptLoaderService } from '../prompt-loader.service';
import { PromptBindingService } from '../../../../modules/prompt/prompt-binding.service';
import { SEMRUSH_PASS_THRESHOLD } from '../../constants/seo-score';
import type { PromptRuntimeSlotId } from '../../../../modules/prompt/prompt-slot-metadata';
import {
  toEnglishPromptScoreBreakdown,
  toEnglishPromptSuggestion,
  toEnglishPromptSuggestions,
} from './prompt-input-en.util';
import { buildProxyHint, fetchWithRetry } from '../../../../core/http/http-fetch';
import { resolveLlmChatCompletionsUrl, resolveLlmConfig, resolveLlmSampling, type LlmTask } from './llm.config';

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 180_000);
const BRIEF_SUMMARY_FALLBACK_ZH = '（无 Brief 摘要，按当前正文结构与主题保留核心信息）';
const BRIEF_SUMMARY_FALLBACK_EN =
  '(No Brief summary — preserve core structure and topic from current body)';
const SUGGESTION_FALLBACK_ZH = '（无具体条目，请按可读性、去 AI 感与原创性整体润色）';
const KEYWORD_FALLBACK_ZH = '（无额外实体词，保持现有术语覆盖）';

function buildContentCoverageMaxedBlock(input: OptimizeInput): string {
  if (!input.contentCoverageMaxed) return '';
  return [
    '## CONTENT COVERAGE MAXED (do NOT add SERP sentences or keyword placements)',
    '',
    'Keyword coverage and SERP entities are already **25/25**. Adding new entity sentences will **hurt** readability and word count.',
    '',
    '**This round: readability + structure ONLY** — split long sentences (≤22 words), trim to 105% word cap, fix long paragraphs.',
    'Do **not** add paragraphs, bullet lists, or new terminology unless required to fix structure.',
  ].join('\n');
}

function buildReadabilityPriorityBlock(input: OptimizeInput): string {
  if (!input.readabilityPriority) return '';
  const audit =
    input.readabilityAudit?.trim() ||
    'Scan the body and split every sentence over 22 words and every paragraph over 80 words.';

  if (input.optimizePhase === 'semrush') {
    const gap =
      typeof input.pointsToGo === 'number'
        ? String(input.pointsToGo)
        : '?';
    const ultraNear = typeof input.pointsToGo === 'number' && input.pointsToGo <= 0.1;
    const surgicalBlock = ultraNear
      ? [
          '',
          '## ULTRA NEAR-MISS (8.9→9.0) — SURGICAL EDITS ONLY',
          '',
          '- Change **only** sentences explicitly listed in suggestions (casual tone quotes)',
          '- Do **not** restructure H2s, delete sections, or rewrite unlisted sentences',
          '- Word count ±3%; keep every link, image, and recommended keyword',
          '',
        ].join('\n')
      : '';
    return [
      '## SEMRUSH READABILITY PRIORITY (this round ONLY)',
      '',
      `Semrush Overall is **${gap} points** below ${SEMRUSH_PASS_THRESHOLD}. **SWA sidebar fixes are mandatory this round.**`,
      '',
      '- Split **every** paragraph over **60 words** (2–3 sentences each); split sentences over **22 words**',
      '- Rewrite **every** casual sentence flagged in suggestions; remove filler adverbs/phrases',
      '- Weave **every** SWA recommended keyword at least once',
      '- Do **not** add length — surgical fixes only unless sidebar says copy is too short',
      '',
      audit,
      surgicalBlock,
      '**Semrush Overall ≥9.0 overrides local pre-check score this round.**',
    ].join('\n');
  }

  const points =
    typeof input.pointsToGo === 'number' ? String(input.pointsToGo) : '?';
  const target = input.localScoreTarget ?? LOCAL_SEO_PASS_THRESHOLD;
  return [
    '## READABILITY PRIORITY MODE (this round ONLY)',
    '',
    `Local score is **${points} points** below ${target}. **Readability is the sole goal this round.**`,
    '',
    '- Split **every** sentence over **22 words**; split paragraphs over **80 words**',
    '- **Keep every SERP entity term** — use shorter sentences, not long clauses',
    '- Do **not** add length or new sections — surgical splits only',
    '',
    audit,
    '',
    '**This round overrides "keep entities over readability"** — entities stay, sentences MUST shorten.',
  ].join('\n');
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

@Injectable()
export class OpenAiCompatibleAdapter implements ILLMProvider {
  constructor(
    private readonly logger: LoggerService,
    private readonly promptLoader: PromptLoaderService,
    private readonly promptBinding: PromptBindingService,
  ) {}

  private loadPromptVersion(slotId: PromptRuntimeSlotId): Promise<string> {
    return this.promptBinding.getActiveVersion(slotId);
  }

  async generateBrief(input: BriefInput): Promise<BriefOutput> {
    const promptVersion = await this.loadPromptVersion('brief');
    const template = await this.promptLoader.load(promptVersion);
    const userContent = this.fillTemplate(template, {
      ...this.buildPromptVars(input),
      searchIntent: input.searchIntent ?? 'informational',
      intentGuidelines: input.intentGuidelines ?? '(Follow standard informational SEO structure.)',
      contentForm: input.contentForm ?? 'standard SEO article',
      contentFormGuidelines: input.contentFormGuidelines ?? '(Use standard article structure.)',
      clusterContext: input.clusterContext ?? '(Not part of a topic cluster.)',
      serpContext: this.formatSerpContext(input.serpContext),
    });

    const outline = await this.chatJson(userContent, 'generateBrief', resolveLlmSampling('default'), 'brief');
    return { outline, promptVersion };
  }

  async generateDraft(input: DraftInput): Promise<DraftOutput> {
    const promptVersion = await this.loadPromptVersion('draft');
    const template = await this.promptLoader.load(promptVersion);
    const userContent = this.fillTemplate(template, {
      ...this.buildPromptVars(input),
      brief: JSON.stringify(input.brief.outline),
      searchIntent: input.searchIntent ?? 'informational',
      intentGuidelines: input.intentGuidelines ?? '(Follow standard informational SEO structure.)',
      contentForm: input.contentForm ?? 'standard SEO article',
      contentFormGuidelines: input.contentFormGuidelines ?? '(Use standard article structure.)',
      clusterContext: input.clusterContext ?? '(Not part of a topic cluster.)',
    });

    const parsed = await this.chatJson<{
      title?: string;
      content?: string;
      metaDescription?: string;
    }>(userContent, 'generateDraft', resolveLlmSampling('default'), 'draft');
    const content = typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed);
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : undefined;
    const metaDescription =
      typeof parsed.metaDescription === 'string' ? parsed.metaDescription.trim() : undefined;

    return { title, content, metaDescription, promptVersion };
  }

  async generateOptimize(input: OptimizeInput): Promise<OptimizeOutput> {
    const promptVersion = await this.loadPromptVersion(
      input.optimizePhase === 'semrush' ? 'semrushOptimize' : 'localOptimize',
    );
    const template = await this.promptLoader.load(promptVersion);
    const suggestionBlock =
      input.suggestions.length > 0
        ? toEnglishPromptSuggestions(input.suggestions)
            .map((line) => `- ${line}`)
            .join('\n')
        : `- ${toEnglishPromptSuggestion(SUGGESTION_FALLBACK_ZH)}`;
    const keywordBlock =
      (input.recommendedKeywords ?? []).length > 0
        ? input.recommendedKeywords!.map((term) => `- ${term}`).join('\n')
        : `- ${toEnglishPromptSuggestion(KEYWORD_FALLBACK_ZH)}`;

    const competitorWords = input.semrushCompetitorWordCount;
    const currentWords = input.semrushCurrentWordCount;
    const readability = input.semrushReadabilityScore;
    const semrushWordCap =
      typeof competitorWords === 'number' && competitorWords > 0
        ? String(competitorWords + 50)
        : '(unknown — if sidebar says "longer than competitors", trim toward competitor length)';
    const semrushWordTarget =
      typeof competitorWords === 'number' && competitorWords > 0
        ? String(competitorWords)
        : '(unknown)';
    const semrushCurrentWords =
      typeof currentWords === 'number' && currentWords > 0 ? String(currentWords) : '(unknown)';
    const semrushReadability =
      typeof readability === 'number' ? `${readability}/100` : '(unknown, target ≥70)';
    const localScore =
      typeof input.localScore === 'number' ? String(input.localScore) : '(unknown)';
    const localScoreTarget = String(input.localScoreTarget ?? LOCAL_SEO_PASS_THRESHOLD);
    const localScoreBreakdown = toEnglishPromptScoreBreakdown(
      input.localScoreBreakdown?.trim() || '（无明细；按优化建议与 SERP 实体词列表逐项落实）',
    );
    const optimizeHistoryContext =
      input.optimizeHistoryContext?.trim() ||
      '(First optimization round — no prior history.)';
    const focusDimensions =
      input.focusDimensions?.trim() ||
      '(Address the lowest-scoring dimensions in the breakdown above.)';
    const readabilityPriorityBlock = buildReadabilityPriorityBlock(input);
    const contentCoverageMaxedBlock = buildContentCoverageMaxedBlock(input);
    const scoreGapPlan =
      input.scoreGapPlan?.trim() ||
      '(Use the breakdown above — fix the smallest gap dimension first.)';

    const userContent = this.fillTemplate(template, {
      ...this.buildPromptVars(input),
      searchIntent: input.searchIntent ?? 'informational',
      targetWordCount: String(input.targetWordCount ?? 1500),
      localScore,
      localScoreTarget,
      localScoreBreakdown,
      scoreGapPlan,
      optimizeHistoryContext,
      focusDimensions,
      readabilityPriorityBlock,
      contentCoverageMaxedBlock,
      semrushCompetitorWordCount: semrushWordTarget,
      semrushCurrentWordCount: semrushCurrentWords,
      semrushReadabilityScore: semrushReadability,
      semrushWordCountCap: semrushWordCap,
      briefSummary:
        input.briefSummary?.trim() === BRIEF_SUMMARY_FALLBACK_ZH || !input.briefSummary?.trim()
          ? BRIEF_SUMMARY_FALLBACK_EN
          : input.briefSummary,
      recommendedKeywords: keywordBlock,
      suggestions: suggestionBlock,
      content: input.content,
    });

    const parsed = await this.chatJson<{
      content?: string;
      changesSummary?: string[];
      warnings?: string[];
    }>(userContent, 'generateOptimize', resolveLlmSampling('optimize'), 'optimize');
    const content = typeof parsed.content === 'string' ? parsed.content : input.content;
    const changesSummary = Array.isArray(parsed.changesSummary)
      ? parsed.changesSummary.filter((item): item is string => typeof item === 'string')
      : undefined;
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((item): item is string => typeof item === 'string')
      : undefined;

    return { content, promptVersion, changesSummary, warnings };
  }

  async generateRewrite(input: RewriteInput): Promise<RewriteOutput> {
    const promptVersion = await this.loadPromptVersion('rewrite');
    const template = await this.promptLoader.load(promptVersion);
    const userContent = this.fillTemplate(template, {
      ...this.buildPromptVars(input),
      searchIntent: input.searchIntent ?? 'informational',
      targetWordCount: String(input.targetWordCount ?? 1500),
      briefSummary:
        input.briefSummary?.trim() === BRIEF_SUMMARY_FALLBACK_ZH || !input.briefSummary?.trim()
          ? BRIEF_SUMMARY_FALLBACK_EN
          : input.briefSummary,
      instruction: input.instruction,
      content: input.content,
    });

    const parsed = await this.chatJson<{
      content?: string;
      changesSummary?: string[];
      warnings?: string[];
    }>(userContent, 'generateRewrite', resolveLlmSampling('optimize'), 'rewrite');
    const content = typeof parsed.content === 'string' ? parsed.content : input.content;
    const changesSummary = Array.isArray(parsed.changesSummary)
      ? parsed.changesSummary.filter((item): item is string => typeof item === 'string')
      : undefined;
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((item): item is string => typeof item === 'string')
      : undefined;

    return { content, promptVersion, changesSummary, warnings };
  }

  async generateKeywordSeeds(input: KeywordSeedInput): Promise<KeywordSeedOutput> {
    const promptVersion = await this.loadPromptVersion('keywordSeed');
    const template = await this.promptLoader.load(promptVersion);
    const count = Math.min(Math.max(input.count ?? 15, 5), 30);
    const contentLanguage = normalizeContentLanguage(input.contentLanguage);

    const userContent = this.fillTemplate(template, {
      siteDomain: input.siteDomain,
      targetMarket: input.targetMarket?.trim() || 'Global',
      outputLanguage: getContentLanguageLabel(contentLanguage),
      brandVoice: input.brandVoice ?? defaultBrandVoice(contentLanguage),
      topicHint: input.topicHint?.trim() || '（无额外主题约束，按站点整体定位扩展）',
      count: String(count),
    });

    const parsed = await this.chatJson<{ keywords?: KeywordSeedOutput['keywords'] }>(
      userContent,
      'generateKeywordSeeds',
      resolveLlmSampling('default'),
      'default',
    );

    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter(
            (item): item is KeywordSeedOutput['keywords'][number] =>
              typeof item?.keyword === 'string' && item.keyword.trim().length >= 2,
          )
          .slice(0, count)
      : [];

    if (keywords.length === 0) {
      throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, 'AI 未返回有效关键词，请重试');
    }

    return { keywords, promptVersion };
  }

  async generateParaphrase(input: ParaphraseInput): Promise<ParaphraseOutput> {
    const promptVersion = await this.loadPromptVersion('quillbot');
    const template = await this.promptLoader.load(promptVersion);
    const contentLanguage = normalizeContentLanguage(input.contentLanguage);
    const protectedTerms =
      input.protectedTerms?.filter(Boolean).join(', ') || '(none — preserve existing terminology)';

    const userContent = this.fillTemplate(template, {
      keyword: input.keyword,
      searchIntent: input.searchIntent ?? 'informational',
      outputLanguage: getContentLanguageLabel(contentLanguage),
      brandVoice: input.brandVoice ?? defaultBrandVoice(contentLanguage),
      protectedTerms,
      briefSummary: input.briefSummary ?? '（无额外 Brief 约束）',
      semrushCurrentWordCount:
        typeof input.semrushCurrentWordCount === 'number'
          ? String(input.semrushCurrentWordCount)
          : 'unknown',
      semrushCompetitorWordCount:
        typeof input.semrushCompetitorWordCount === 'number'
          ? String(input.semrushCompetitorWordCount)
          : 'unknown',
      semrushWordCountCap:
        typeof input.semrushWordCountCap === 'number'
          ? String(input.semrushWordCountCap)
          : 'no cap',
      chunkHint:
        input.chunkHint?.trim() ||
        'Full article — preserve keyword in the first 200 characters of the body.',
      content: input.content,
    });

    const parsed = await this.chatJson<{
      content?: string;
      changesSummary?: string[];
      warnings?: string[];
    }>(userContent, 'generateParaphrase', resolveLlmSampling('optimize'), 'rewrite');

    const content = typeof parsed.content === 'string' ? parsed.content : input.content;
    const changesSummary = Array.isArray(parsed.changesSummary)
      ? parsed.changesSummary.filter((item): item is string => typeof item === 'string')
      : undefined;
    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((item): item is string => typeof item === 'string')
      : undefined;

    return { content, promptVersion, changesSummary, warnings };
  }

  async validateParaphrase(input: ParaphraseValidateInput): Promise<ParaphraseValidateOutput> {
    const promptVersion = await this.loadPromptVersion('quillbotValidate');
    const template = await this.promptLoader.load(promptVersion);
    const contentLanguage = normalizeContentLanguage(input.contentLanguage);
    const protectedTerms =
      input.protectedTerms?.filter(Boolean).join(', ') || '(none)';

    const userContent = this.fillTemplate(template, {
      keyword: input.keyword,
      outputLanguage: getContentLanguageLabel(contentLanguage),
      protectedTerms,
      originalContent: input.originalContent,
      paraphrasedContent: input.paraphrasedContent,
    });

    const parsed = await this.chatJson<{ passed?: boolean; warnings?: string[] }>(
      userContent,
      'validateParaphrase',
      resolveLlmSampling('default'),
      'default',
    );

    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((item): item is string => typeof item === 'string')
      : [];

    return {
      passed: parsed.passed === true,
      warnings,
      promptVersion,
    };
  }

  private buildPromptVars(input: {
    keyword: string;
    brandVoice?: string;
    contentLanguage?: string;
  }): Record<string, string> {
    const contentLanguage = normalizeContentLanguage(input.contentLanguage);
    return {
      keyword: input.keyword,
      outputLanguage: getContentLanguageLabel(contentLanguage),
      brandVoice: input.brandVoice ?? defaultBrandVoice(contentLanguage),
    };
  }

  private formatSerpContext(serpContext: unknown): string {
    if (!serpContext || typeof serpContext !== 'object') {
      return '(No SERP context available.)';
    }

    const data = serpContext as {
      organic?: Array<{
        position?: number;
        title?: string;
        snippet?: string;
        link?: string;
        scraped?: {
          wordCount?: number;
          headings?: string[];
          excerpt?: string;
          error?: string;
        };
      }>;
    };

    const organic = data.organic ?? [];
    if (organic.length === 0) {
      return '(No SERP organic results in context.)';
    }

    const lines = organic.map((item, index) => {
      const pos = item.position ?? index + 1;
      const title = item.title?.trim() || '(untitled)';
      const snippet = item.snippet?.trim() || '';
      const link = item.link?.trim() || '';
      const scraped = item.scraped;
      const parts = [`#${pos} ${title}`, `URL: ${link}`, `Snippet: ${snippet}`];

      if (scraped && !scraped.error) {
        parts.push(`Word count: ~${scraped.wordCount ?? 0}`);
        if (scraped.headings?.length) {
          parts.push(`Headings: ${scraped.headings.slice(0, 10).join(' | ')}`);
        }
        if (scraped.excerpt) {
          parts.push(`Excerpt: ${scraped.excerpt.slice(0, 400)}`);
        }
      } else if (scraped?.error) {
        parts.push(`(Page scrape failed: ${scraped.error})`);
      }

      return parts.join('\n');
    });

    return lines.join('\n\n').slice(0, 8000);
  }

  private buildJsonSystemPrompt(strict: boolean): string {
    const base =
      'You output valid JSON only. No Markdown code fences, XML tags, chain-of-thought, thinking blocks, or commentary outside the JSON object.';
    if (!strict) return base;
    return `${base} Start your response with { and end with }. Do not include any text before or after the JSON.`;
  }

  private async parseJsonWithRetry<T>(
    raw: string,
    retryFetch: () => Promise<string>,
    action: string,
    providerLabel: string,
    model: string,
  ): Promise<T> {
    try {
      return parseLlmJson<T>(raw);
    } catch (error) {
      if (!(error instanceof LlmJsonParseError)) {
        throw error;
      }

      this.logger.warn('LLM JSON parse failed, retrying once', {
        action,
        provider: providerLabel,
        model,
        rawSnippet: error.rawSnippet,
      });

      try {
        const retryRaw = await retryFetch();
        return parseLlmJson<T>(retryRaw);
      } catch (retryError) {
        if (retryError instanceof LlmJsonParseError) {
          this.logger.error('LLM JSON parse failed after retry', {
            action,
            provider: providerLabel,
            model,
            rawSnippet: retryError.rawSnippet,
          });
          throw new BusinessException(ErrorCodes.LLM_PARSE_ERROR, '大模型返回格式无效，请重试');
        }
        throw retryError;
      }
    }
  }

  private fillTemplate(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
      template,
    );
  }

  private async chatJson<T>(
    userContent: string,
    action: string,
    sampling?: ReturnType<typeof resolveLlmSampling>,
    task: LlmTask = 'default',
  ): Promise<T> {
    let config;
    try {
      config = resolveLlmConfig(task);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LLM 配置无效';
      throw new BusinessException(ErrorCodes.EXTERNAL_API_ERROR, message);
    }

    const apiUrl = resolveLlmChatCompletionsUrl(config.baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    if (task === 'optimize' || task === 'rewrite' || task === 'draft') {
      this.logger.info('LLM chat request', {
        action,
        task,
        model: config.model,
        provider: config.providerLabel,
      });
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: 'system', content: this.buildJsonSystemPrompt(false) },
        { role: 'user', content: userContent },
      ],
    };
    if (config.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    if (sampling) {
      body.temperature = sampling.temperature;
      if (sampling.seed != null) {
        body.seed = sampling.seed;
      }
    }

    try {
      const response = await fetchWithRetry(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
        { label: config.providerLabel },
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const detail = errorBody ? `：${errorBody.slice(0, 200)}` : '';
        throw new BusinessException(
          ErrorCodes.EXTERNAL_API_ERROR,
          `${config.providerLabel} API 请求失败：HTTP ${response.status}${detail}`,
        );
      }

      const data = (await response.json()) as OpenAiChatResponse;
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) {
        throw new BusinessException(
          ErrorCodes.EXTERNAL_API_ERROR,
          `${config.providerLabel} 返回内容为空`,
        );
      }

      return this.parseJsonWithRetry<T>(raw, async () => {
        const retryBody = {
          ...body,
          messages: [
            { role: 'system', content: this.buildJsonSystemPrompt(true) },
            { role: 'user', content: `${userContent}\n\nREMINDER: Reply with ONE raw JSON object only.` },
          ],
        };

        const retryResponse = await fetchWithRetry(
          apiUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify(retryBody),
            signal: controller.signal,
          },
          { label: config.providerLabel },
        );

        if (!retryResponse.ok) {
          throw new BusinessException(
            ErrorCodes.EXTERNAL_API_ERROR,
            `${config.providerLabel} JSON 重试请求失败：HTTP ${retryResponse.status}`,
          );
        }

        const retryData = (await retryResponse.json()) as OpenAiChatResponse;
        const retryRaw = retryData.choices?.[0]?.message?.content;
        if (!retryRaw) {
          throw new BusinessException(
            ErrorCodes.EXTERNAL_API_ERROR,
            `${config.providerLabel} JSON 重试返回内容为空`,
          );
        }
        return retryRaw;
      }, action, config.providerLabel, config.model);
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : '未知错误';
      const cause =
        error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
      const proxyHint = buildProxyHint(error);
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        `${config.providerLabel} API 调用失败：${message}${cause ? `（${cause}）` : ''}${proxyHint}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
