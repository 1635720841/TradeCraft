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
  filterUsableCompetitorSamples,
  getContentLanguageLabel,
  LOCAL_SEO_PASS_THRESHOLD,
  normalizeContentLanguage,
  parseLlmJson,
  LlmJsonParseError,
  resolveSemrushReadabilityTarget,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  SEMRUSH_FLESCH_TOLERANCE,
  SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO,
  SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO,
  SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO,
  resolveSemrushWordCountHardCap,
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
  ScoreReverseAnalysisInput,
  ScoreReverseAnalysisOutput,
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
const LLM_DEBUG_PROMPT_ENABLED = process.env.LLM_DEBUG_PROMPT === 'true';
const SEMRUSH_TOO_PLAIN_SIGNAL_RE =
  /最为随意|随意句子|Most casual sentences|太过浅显|语言平实|更高级|professional audience|too plain|too simple|too easy|plain language/i;

function hasSemrushTooPlainSignals(input: OptimizeInput): boolean {
  if (input.optimizePhase !== 'semrush') return false;
  const readability = input.semrushReadabilityScore;
  if (
    typeof readability === 'number' &&
    readability > SEMRUSH_FLESCH_TARGET_DEFAULT + SEMRUSH_FLESCH_TOLERANCE
  ) {
    return true;
  }
  return SEMRUSH_TOO_PLAIN_SIGNAL_RE.test(input.suggestions.join('\n'));
}

function buildSemrushToneGuardBlock(input: OptimizeInput): string {
  if (input.optimizePhase !== 'semrush') return '';
  const hasKeywordBatch = (input.keywordBatch?.length ?? 0) > 0;
  const hasTooPlainSignals = hasSemrushTooPlainSignals(input);
  if (!hasKeywordBatch && !hasTooPlainSignals) return '';

  return [
    '## SEMRUSH TONE / ANTI-STUFFING GUARD (highest priority)',
    '',
    'Do not solve keyword coverage by adding standalone keyword sentences, keyword lists, or repeated short commands.',
    '',
    '- Group 2–3 missing SWA terms inside one technical explanation, FAQ answer, or decision paragraph',
    '- Each edited sentence must explain why/when/how, not merely name a term',
    '- Avoid stacked imperative openings such as Measure, Check, Replace, Stop, Seat, Wait',
    '- If Semrush flags casual sentences, rewrite those exact short fragments into B2B technical prose first',
    '- Keep the submitted Semrush target keywords unchanged; only weave recommended terms into the body',
  ].join('\n');
}

function buildWordCountExpandPriorityBlock(input: OptimizeInput): string {
  if (!input.wordCountExpandPriority) return '';
  const swaTarget =
    typeof input.semrushCompetitorWordCount === 'number' && input.semrushCompetitorWordCount > 0
      ? input.semrushCompetitorWordCount
      : input.targetWordCount ?? 1500;
  const localTarget = input.semrushLocalExpandWordTarget ?? swaTarget;
  const swaCurrent =
    typeof input.semrushCurrentWordCount === 'number'
      ? input.semrushCurrentWordCount
      : undefined;
  const localCurrent =
    typeof input.localWordCount === 'number' ? input.localWordCount : swaCurrent;
  const localGap =
    localCurrent !== undefined ? Math.max(0, localTarget - localCurrent) : undefined;
  const swaGap =
    swaCurrent !== undefined ? Math.max(0, swaTarget - swaCurrent) : undefined;
  const faqCount =
    localGap !== undefined ? Math.min(4, Math.max(2, Math.ceil(localGap / 50))) : 3;
  const seoProtection = buildSeoProtectionBlock(input);
  return [
    '## WORD COUNT EXPAND PRIORITY (Semrush — this round ONLY)',
    '',
    'Copy is **shorter than the Semrush word-count target**. This outranks minor readability tweaks.',
    '',
    swaCurrent !== undefined
      ? `- SWA counts ~${swaCurrent} words (benchmark ~${swaTarget}${swaGap != null ? `, gap ~${swaGap}` : ''})`
      : `- Semrush benchmark ~${swaTarget} words`,
    localCurrent !== undefined
      ? `- Expand local Markdown toward **${localTarget - 5}–${localTarget}** words (current ~${localCurrent}${localGap != null ? `, gap ~${localGap}` : ''}) — **benchmark +${Math.round(SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO * 100)}%** so SWA still registers enough words`
      : `- Expand toward **~${localTarget} words** locally (benchmark +${Math.round(SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO * 100)}%)`,
    `- Add **${faqCount}** short FAQ Q&As (40–60 words each) or deepen thin H2 sections`,
    '- Do **not** pad with filler; keep sentences ≤22 words and paragraphs ≤65 words',
    '- **Never shorten or delete body paragraphs this round** — only add depth, FAQ, or examples',
    '- Preserve all recommended keywords / SERP entities already in the draft',
    seoProtection,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildWordCountTrimPriorityBlock(input: OptimizeInput): string {
  if (!input.wordCountTrimPriority) return '';
  const competitor =
    typeof input.semrushCompetitorWordCount === 'number'
      ? input.semrushCompetitorWordCount
      : input.targetWordCount ?? 1500;
  const current =
    typeof input.semrushCurrentWordCount === 'number'
      ? input.semrushCurrentWordCount
      : undefined;
  const seoProtection = buildSeoProtectionBlock(input);
  const phaseLabel =
    input.optimizePhase === 'semrush' ? 'Semrush SWA' : 'Semrush calibration';
  return [
    `## WORD COUNT TRIM PRIORITY (${phaseLabel} — this round ONLY)`,
    '',
    `Copy is **more than ${Math.round(SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO * 100)}% over the SWA word-count benchmark**. Trimming outranks minor readability tweaks.`,
    '',
    current !== undefined
      ? `- Current ~${current} words → trim toward **${Math.round(competitor * (1 + SEMRUSH_WORD_COUNT_WRITE_BUFFER_RATIO))}–${Math.round(competitor * (1 + SEMRUSH_WORD_COUNT_SOFT_MAX_RATIO))}** words (benchmark +5%–+15%)`
      : `- Trim toward competitor benchmark **~${competitor} words**`,
    '- Cut: repeated arguments → transitions → secondary examples → long definitions',
    '- **Never delete** sentences containing recommended keywords / SERP entities / Tag terms',
    '- Do **not** add FAQ blocks or new H2 sections this round',
    seoProtection,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTitlePriorityBlock(input: OptimizeInput): string {
  if (!input.titlePriority || input.optimizePhase === 'semrush') return '';
  const title =
    input.articleTitle?.trim() ||
    input.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    '(see H1 in content)';
  const seoProtection = buildSeoProtectionBlock(input);
  return [
    '## TITLE PRIORITY (Semrush calibration — this round ONLY)',
    '',
    'SERP and body coverage are adequate. **Predicted Semrush is blocked by title issues** (SWA sidebar).',
    '',
    `Current title: **${title.slice(0, 120)}**`,
    '',
    `- Shorten to **≤60 characters** (search snippet limit)`,
    `- Use **5–12 words** in the title`,
    '- **Fixed SWA rule**: at least one target keyword in the title; each target keyword at most once in the title',
    '- Keep the target keyword near the start',
    '- Update the Markdown H1 (`# Title`) at the top of the article',
    '- Do **not** add SERP entities or rewrite body paragraphs this round',
    seoProtection,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildHardSentencePriorityBlock(input: OptimizeInput): string {
  if (!input.hardSentencePriority || input.optimizePhase === 'semrush') return '';
  const audit =
    input.readabilityAudit?.trim() ||
    'Scan the body for multi-clause sentences (2+ commas or 3+ and/or) and split each into 2 shorter sentences.';
  const seoProtection = buildSeoProtectionBlock(input);
  return [
    '## HARD-TO-READ SENTENCE PRIORITY (Semrush calibration — this round ONLY)',
    '',
    'SERP and keyword coverage are maxed. **Predicted Semrush is blocked by hard-to-read sentences (>2).**',
    '',
    '**SURGICAL MODE — change ONLY the sentences listed below. Do NOT add SERP entities, new paragraphs, or rewrite unlisted sentences.**',
    '',
    '- Split each flagged sentence into **2 shorter sentences** (≤22 words each)',
    '- **Break `when … or/and …` patterns**: never keep conditional + coordination in one sentence — split at `when` or before `or`/`and`',
    '- Reduce and/or coordination; break multi-clause sentences at commas',
    '- Do **not** add entity terms or keyword filler — shorten surrounding text only',
    '',
    audit,
    seoProtection,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildFleschPriorityBlock(input: OptimizeInput): string {
  if (!input.fleschPriority || input.optimizePhase === 'semrush') return '';
  return [
    '## FLESCH PRIORITY (Semrush calibration — this round ONLY)',
    '',
    'SERP entity coverage is adequate (≥20/25). **Raise Flesch toward ~50** without adding length.',
    '',
    '- Replace **every** Semrush complex word with simpler synonyms',
    '- Split sentences over **22 words**; keep paragraphs ≤ **65 words**',
    '- Use shorter words (fewer syllables) — do NOT add filler paragraphs',
    '- Preserve CRITICAL SEO CONSTRAINT phrases exactly',
  ].join('\n');
}

function buildSerpPriorityBlock(input: OptimizeInput): string {
  if (!input.serpPriority || input.optimizePhase === 'semrush') return '';
  return [
    '## SERP ENTITY PRIORITY (this round ONLY — Semrush calibration)',
    '',
    'Predicted Semrush is below target mainly because **SERP entity coverage** is under 20/25.',
    '',
    '- Weave **2–4 missing SERP entities** into **existing** sentences (one short clause each)',
    '- Do **not** add filler paragraphs or keyword bullet lists',
    '- Do **not** split sentences or change readability until SERP entities are covered',
    '- Keep every phrase listed in CRITICAL SEO CONSTRAINT unchanged',
  ].join('\n');
}

function buildSerpCoverageMaxedBlock(input: OptimizeInput): string {
  if (!input.serpCoverageMaxed || input.contentCoverageMaxed) return '';
  return [
    '## SERP ENTITIES MAXED (25/25) — DO NOT ADD ENTITY SENTENCES',
    '',
    'SERP entity coverage is already full. Weaving more SERP terms **will not increase score** and often **drops readability or keyword density**.',
    '',
    '**Skip SERP weaving entirely this round.** Fix keyword density (0.8%–2.5%) or readability only.',
  ].join('\n');
}

function buildKeywordDensityFocusBlock(input: OptimizeInput): string {
  if (!input.keywordDensityFocus) return '';
  return [
    '## KEYWORD DENSITY FOCUS (this round)',
    '',
    'Keyword coverage is below max because density is in the **secondary band (0.4%–3.5%)** instead of **0.8%–2.5%**.',
    '',
    '- Nudge density into **0.8%–2.5%** by adding **one** natural full-keyword phrase in an existing sentence (opening or body)',
    '- If density is **above 2.5%**, remove one redundant mention instead of adding more',
    '- Keep opening keyword + H2 keyword — do not break them while editing',
    '- Do **not** add keyword lists or `For procurement teams, relevant search terms include...` sentences',
  ].join('\n');
}

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

function buildSeoProtectionBlock(input: OptimizeInput): string {
  const phrases = input.protectedSeoPhrases?.filter((p) => p.trim().length > 0) ?? [];
  if (phrases.length === 0) return '';

  return [
    '## CRITICAL SEO CONSTRAINT (highest priority)',
    '',
    `The current draft successfully contains these exact SEO entities: ${phrases.join(', ')}.`,
    'While splitting sentences or improving readability, you MUST NOT delete or alter these specific phrases.',
    'Preserving them is your highest priority — shorten surrounding text instead.',
  ].join('\n');
}

function buildCalibratedLocalAlignBlock(input: OptimizeInput): string {
  const gap = typeof input.pointsToGo === 'number' ? String(input.pointsToGo) : '?';
  const target = input.predictedSemrushTarget ?? SEMRUSH_PASS_THRESHOLD;
  const current =
    typeof input.predictedSemrush === 'number' ? String(input.predictedSemrush) : '?';
  const localRef =
    typeof input.localScore === 'number' ? String(input.localScore) : '?';
  return [
    '## SEMRUSH CALIBRATION ALIGN (primary goal this round)',
    '',
    `**Predicted Semrush ${current}/10 → need ≥${target}/10** (gap **${gap}** on 0–10 scale).`,
    `Local pre-check ${localRef}/100 is **reference only** — do NOT optimize for local 0–100 when it is already high.`,
    '',
    'Improve Semrush SWA signals: SERP entities (if under 20/25), readability (≤22 words/sentence, ≤65 words/paragraph), complex-word fixes.',
    'Follow suggestions tagged [Semrush 对齐] first — SERP before readability when both are flagged.',
  ].join('\n');
}

function buildReadabilityPriorityBlock(input: OptimizeInput): string {
  if (input.serpPriority && input.optimizePhase !== 'semrush') {
    return buildSerpPriorityBlock(input);
  }
  if (input.titlePriority && input.optimizePhase !== 'semrush') {
    return buildTitlePriorityBlock(input);
  }
  if (input.wordCountExpandPriority) {
    return buildWordCountExpandPriorityBlock(input);
  }
  if (input.wordCountTrimPriority) {
    return buildWordCountTrimPriorityBlock(input);
  }
  if (input.hardSentencePriority && input.optimizePhase !== 'semrush') {
    return buildHardSentencePriorityBlock(input);
  }
  if (input.fleschPriority && input.optimizePhase !== 'semrush') {
    return buildFleschPriorityBlock(input);
  }
  if (input.calibratedLocalAlign && input.optimizePhase !== 'semrush') {
    const seoProtection = buildSeoProtectionBlock(input);
    const audit =
      input.readabilityAudit?.trim() ||
      'Scan the body and split every sentence over 22 words and every paragraph over 65 words.';
    const gap = typeof input.pointsToGo === 'number' ? String(input.pointsToGo) : '?';
    const target = input.predictedSemrushTarget ?? SEMRUSH_PASS_THRESHOLD;
    const current =
      typeof input.predictedSemrush === 'number' ? String(input.predictedSemrush) : '?';
    return [
      '## SEMRUSH CALIBRATION PRIORITY (this round ONLY)',
      '',
      `Predicted Semrush **${current}/10** — **${gap} points** below **${target}/10**.`,
      'Local 0–100 may already be maxed; **readability + SWA fixes are mandatory** to raise predicted Semrush.',
      '',
      '- Split **every** sentence over **22 words**; split paragraphs over **65 words**',
      '- Replace Semrush complex words; rewrite hard-to-read sentences',
      '- **Keep every SERP entity term** — shorten surrounding filler only',
      '',
      audit,
      seoProtection,
    ].join('\n');
  }

  if (!input.readabilityPriority) return '';
  const seoProtection = buildSeoProtectionBlock(input);
  const audit =
    input.readabilityAudit?.trim() ||
    'Scan the body and split every sentence over 22 words and every paragraph over 65 words.';

  if (input.optimizePhase === 'semrush') {
    const gap =
      typeof input.pointsToGo === 'number'
        ? String(input.pointsToGo)
        : '?';
    const tooPlainSignals = hasSemrushTooPlainSignals(input);
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
      tooPlainSignals
        ? '- Keep paragraphs under **60 words**, but do **not** keep making already-short sentences shorter; merge stacked 3–10 word command fragments into 16–24 word technical sentences'
        : '- Split **every** paragraph over **60 words** (2–3 sentences each); split sentences over **22 words**',
      '- Rewrite **every** casual sentence flagged in suggestions; remove filler adverbs/phrases',
      '- Weave **every** SWA recommended keyword at least once (contextual weaving — no list sentences, no standalone keyword sentences)',
      '- Do **not** add length — surgical fixes only unless sidebar says copy is too short',
      '',
      audit,
      seoProtection,
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
    '- Split **every** sentence over **22 words**; split paragraphs over **65 words**',
    '- **Keep every SERP entity term** — use shorter sentences, not long clauses',
    '- Do **not** add length or new sections — surgical splits only',
    '',
    audit,
    seoProtection,
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

  private logPromptDebug(input: {
    action: string;
    task: LlmTask;
    promptVersion?: string;
    userContent: string;
    extra?: Record<string, unknown>;
  }): void {
    if (!LLM_DEBUG_PROMPT_ENABLED) return;
    this.logger.info('LLM prompt debug', {
      action: input.action,
      task: input.task,
      promptVersion: input.promptVersion,
      promptChars: input.userContent.length,
      promptPreview: input.userContent.slice(0, 1000),
      promptFull: input.userContent,
      ...input.extra,
    });
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
    this.logPromptDebug({
      action: 'generateBrief',
      task: 'brief',
      promptVersion,
      userContent,
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
    this.logPromptDebug({
      action: 'generateDraft',
      task: 'draft',
      promptVersion,
      userContent,
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
    const useCalibratedPrompt =
      input.calibratedLocalAlign === true && input.optimizePhase !== 'semrush';
    const promptVersion = useCalibratedPrompt
      ? 'seo_optimize_calibrated_v1'
      : await this.loadPromptVersion(
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
        ? String(resolveSemrushWordCountHardCap(competitorWords))
        : '(unknown — if sidebar says "longer than competitors", trim toward benchmark +5%–+15%)';
    const semrushWordTarget =
      typeof input.semrushLocalExpandWordTarget === 'number' &&
      input.semrushLocalExpandWordTarget > 0
        ? String(input.semrushLocalExpandWordTarget)
        : typeof competitorWords === 'number' && competitorWords > 0
          ? String(competitorWords)
          : '(unknown)';
    const semrushSwaBenchmark =
      typeof competitorWords === 'number' && competitorWords > 0
        ? String(competitorWords)
        : '(unknown)';
    const semrushCurrentWords =
      typeof currentWords === 'number' && currentWords > 0 ? String(currentWords) : '(unknown)';
    const semrushReadability =
      typeof readability === 'number' ? `${readability}/100` : '(unknown)';
    const readabilityTarget = resolveSemrushReadabilityTarget(readability);
    const semrushReadabilityTarget = `${readabilityTarget} (±${SEMRUSH_FLESCH_TOLERANCE})`;
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
    const contentCoverageMaxedBlock = buildContentCoverageMaxedBlock(input);
    const serpCoverageMaxedBlock = buildSerpCoverageMaxedBlock(input);
    const keywordDensityFocusBlock = buildKeywordDensityFocusBlock(input);
    const semrushToneGuardBlock = buildSemrushToneGuardBlock(input);
    const scoreGapPlanRawBase =
      input.scoreGapPlan?.trim() ||
      '(Use the breakdown above — fix the smallest gap dimension first.)';
    const scoreGapPlanRaw = semrushToneGuardBlock
      ? `${semrushToneGuardBlock}\n\n${scoreGapPlanRawBase}`
      : scoreGapPlanRawBase;
    const serpPriorityBlock = buildSerpPriorityBlock(input);
    const titlePriorityBlock = buildTitlePriorityBlock(input);
    const wordCountTrimPriorityBlock = buildWordCountTrimPriorityBlock(input);
    const wordCountExpandPriorityBlock = buildWordCountExpandPriorityBlock(input);
    const fleschPriorityBlock = buildFleschPriorityBlock(input);
    const scoreGapPlan = input.calibratedLocalAlign
      ? `${serpPriorityBlock ? `${serpPriorityBlock}\n\n` : ''}${titlePriorityBlock ? `${titlePriorityBlock}\n\n` : ''}${wordCountExpandPriorityBlock ? `${wordCountExpandPriorityBlock}\n\n` : ''}${wordCountTrimPriorityBlock ? `${wordCountTrimPriorityBlock}\n\n` : ''}${fleschPriorityBlock ? `${fleschPriorityBlock}\n\n` : ''}${useCalibratedPrompt ? '' : `${buildCalibratedLocalAlignBlock(input)}\n\n`}${scoreGapPlanRaw}`
      : wordCountExpandPriorityBlock
        ? `${wordCountExpandPriorityBlock}\n\n${scoreGapPlanRaw}`
        : scoreGapPlanRaw;
    const readabilityPriorityBlock = buildReadabilityPriorityBlock({
      ...input,
      readabilityPriority:
        input.readabilityPriority === true ||
        (input.calibratedLocalAlign === true &&
          (input.pointsToGo ?? 0) > 0 &&
          input.serpPriority !== true &&
          input.titlePriority !== true &&
          input.wordCountExpandPriority !== true &&
          input.wordCountTrimPriority !== true &&
          input.fleschPriority !== true &&
          input.hardSentencePriority !== true),
    });

    const predictedSemrush =
      typeof input.predictedSemrush === 'number' ? String(input.predictedSemrush) : '(unknown)';
    const predictedSemrushTarget = String(
      input.predictedSemrushTarget ?? SEMRUSH_PASS_THRESHOLD,
    );

    const userContent = this.fillTemplate(template, {
      ...this.buildPromptVars(input),
      searchIntent: input.searchIntent ?? 'informational',
      targetWordCount: String(input.targetWordCount ?? 1500),
      localScore,
      localScoreTarget,
      localScoreBreakdown,
      predictedSemrush,
      predictedSemrushTarget,
      scoreGapPlan,
      optimizeHistoryContext,
      focusDimensions,
      readabilityPriorityBlock,
      contentCoverageMaxedBlock,
      serpCoverageMaxedBlock,
      keywordDensityFocusBlock,
      semrushCompetitorWordCount: semrushSwaBenchmark,
      semrushLocalExpandWordTarget: semrushWordTarget,
      semrushCurrentWordCount: semrushCurrentWords,
      semrushReadabilityScore: semrushReadability,
      semrushReadabilityTarget,
      semrushWordCountCap: semrushWordCap,
      briefSummary:
        input.briefSummary?.trim() === BRIEF_SUMMARY_FALLBACK_ZH || !input.briefSummary?.trim()
          ? BRIEF_SUMMARY_FALLBACK_EN
          : input.briefSummary,
      recommendedKeywords: keywordBlock,
      suggestions: suggestionBlock,
      content: input.content,
    });
    this.logPromptDebug({
      action: 'generateOptimize',
      task: 'optimize',
      promptVersion,
      userContent,
      extra: {
        optimizePhase: input.optimizePhase,
        recommendedKeywordCount: input.recommendedKeywords?.length ?? 0,
        suggestionCount: input.suggestions.length,
        roundAction: input.roundAction,
        keywordBatch: input.keywordBatch,
        keywordBatchCount: input.keywordBatch?.length ?? 0,
      },
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
    this.logPromptDebug({
      action: 'generateRewrite',
      task: 'rewrite',
      promptVersion,
      userContent,
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

    const userContent = [
      this.fillTemplate(template, {
        siteDomain: input.siteDomain,
        targetMarket: input.targetMarket?.trim() || 'Global',
        outputLanguage: getContentLanguageLabel(contentLanguage),
        brandVoice: input.brandVoice ?? defaultBrandVoice(contentLanguage),
        topicHint: input.topicHint?.trim() || '（无额外主题约束，按站点整体定位扩展）',
        count: String(count),
      }),
      '',
      'CRITICAL: Every `rationale` MUST be one short sentence in 简体中文 only (for operator review).',
      'The `keyword` field follows Output language above; do not write English rationales.',
    ].join('\n');
    this.logPromptDebug({
      action: 'generateKeywordSeeds',
      task: 'default',
      promptVersion,
      userContent,
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

  async analyzeScoreReverseExperiment(
    input: ScoreReverseAnalysisInput,
  ): Promise<ScoreReverseAnalysisOutput> {
    const promptVersion = 'score_reverse_analysis_v1';
    const userContent = [
      'You are a rigorous SEO scoring reverse-engineering research assistant.',
      'Analyze only the supplied controlled-experiment statistics. Never invent a causal rule.',
      'This input represents one article. A finding from one article can never be high confidence; cap it at medium even when repeated readings are identical.',
      'Prefer round-paired deltas over a difference of medians, and explicitly flag baseline drift.',
      'Distinguish measured evidence from hypotheses. Treat low sample counts, warnings, node drift, and variance as limitations.',
      'Recommend the smallest useful next controlled experiment. Do not suggest free-form article rewrites.',
      'Write all human-readable fields in Simplified Chinese.',
      '',
      'Return one JSON object with exactly this shape:',
      '{',
      '  "summary": "short overall conclusion",',
      '  "findings": [{ "factorKey": "variant key", "title": "finding", "evidence": "numeric evidence", "interpretation": "careful interpretation", "confidence": "high|medium|low" }],',
      '  "limitations": ["limitation"],',
      '  "nextActions": [{ "factorKey": "optional existing factor key", "title": "next experiment", "rationale": "why it is valuable", "priority": "high|medium|low" }]',
      '}',
      '',
      `Experiment data:\n${JSON.stringify(input)}`,
    ].join('\n');
    this.logPromptDebug({
      action: 'analyzeScoreReverseExperiment',
      task: 'default',
      promptVersion,
      userContent,
    });
    const parsed = await this.chatJson<Partial<ScoreReverseAnalysisOutput>>(
      userContent,
      'analyzeScoreReverseExperiment',
      resolveLlmSampling('optimize'),
      'default',
    );
    const allowedConfidence = new Set(['high', 'medium', 'low']);
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            factorKey: typeof item.factorKey === 'string' ? item.factorKey.trim() : '',
            title: typeof item.title === 'string' ? item.title.trim() : '',
            evidence: typeof item.evidence === 'string' ? item.evidence.trim() : '',
            interpretation:
              typeof item.interpretation === 'string' ? item.interpretation.trim() : '',
            confidence: item.confidence === 'medium'
              ? 'medium' as const
              : 'low' as const,
          }))
          .filter((item) => item.title && item.evidence && item.interpretation)
          .slice(0, 8)
      : [];
    const limitations = Array.isArray(parsed.limitations)
      ? parsed.limitations
          .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          .map((item) => item.trim())
          .slice(0, 8)
      : [];
    const nextActions = Array.isArray(parsed.nextActions)
      ? parsed.nextActions
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            ...(typeof item.factorKey === 'string' && item.factorKey.trim()
              ? { factorKey: item.factorKey.trim() }
              : {}),
            title: typeof item.title === 'string' ? item.title.trim() : '',
            rationale: typeof item.rationale === 'string' ? item.rationale.trim() : '',
            priority: allowedConfidence.has(item.priority ?? '')
              ? item.priority as 'high' | 'medium' | 'low'
              : 'medium' as const,
          }))
          .filter((item) => item.title && item.rationale)
          .slice(0, 6)
      : [];
    if (!summary) {
      throw new BusinessException(ErrorCodes.LLM_PARSE_ERROR, 'AI 未返回有效实验结论，请重试');
    }
    return { summary, findings, limitations, nextActions, promptVersion };
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
    this.logPromptDebug({
      action: 'generateParaphrase',
      task: 'rewrite',
      promptVersion,
      userContent,
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
    this.logPromptDebug({
      action: 'validateParaphrase',
      task: 'default',
      promptVersion,
      userContent,
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
      competitorScrapeMeta?: { skipped?: boolean };
    };

    const organic =
      data.competitorScrapeMeta?.skipped === false
        ? filterUsableCompetitorSamples(data.organic ?? [])
        : data.organic ?? [];
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
