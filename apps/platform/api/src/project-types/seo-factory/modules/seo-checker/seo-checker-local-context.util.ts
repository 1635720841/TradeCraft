/**
 * SEO 查分：本地优化上下文与可读性审计。
 */
import {
  LOCAL_PARAGRAPH_MAX_WORDS,
  SEMRUSH_FLESCH_TARGET_DEFAULT,
  SEMRUSH_TITLE_MAX_CHARS,
  SEMRUSH_TITLE_WORD_MIN,
  SEMRUSH_TITLE_WORD_MAX,
  SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO,
  analyzeSemrushTitleIssues,
  buildLocalScoreGapPlan,
  buildSemrushWordCountPlan,
  formatHardToReadSentenceAuditBlock,
  resolveSemrushArticleTitle,
  resolveSemrushTrimWordTargetRange,
  type LocalSeoScoreResult,
  type ScoreCalibrationPrediction,
} from '@wm/shared-core';
import { LOCAL_SEO_NEAR_MISS_MARGIN, SEMRUSH_NEAR_MISS_MARGIN } from '../../constants/seo-score';
import {
  DEFAULT_SITE_SEO_SCORE_CONFIG,
  type ResolvedSiteSeoScoreConfig,
} from '../../constants/site-seo-score-settings';
import {
  localGatePointsToGo,
  resolveCalibratedOptimizeFocus,
  resolveLocalGateContext,
  type LocalGateContext,
} from '../../utils/score-calibration-local-align.util';
import { resolveOptimizeWordCountTarget, shouldPrioritizeWordCountExpand } from '../llm/optimize-context.util';

export function buildLocalOptimizeContext(
    localResult: LocalSeoScoreResult,
    content: string,
    scoreConfig: ResolvedSiteSeoScoreConfig = DEFAULT_SITE_SEO_SCORE_CONFIG,
    localGate?: LocalGateContext,
    prediction?: ScoreCalibrationPrediction | null,
    focusContext?: {
      targetKeyword?: string;
      articleTitle?: string;
      targetWordCount?: number;
      competitorWordCount?: number;
      semrushCurrentWordCount?: number;
    },
  ): {
    suggestions: string[];
    readabilityPriority: boolean;
    serpPriority: boolean;
    fleschPriority: boolean;
    hardSentencePriority: boolean;
    titlePriority: boolean;
    wordCountTrimPriority: boolean;
    wordCountExpandPriority: boolean;
    resolvedTitle: string;
    readabilityAudit?: string;
    pointsToGo?: number;
    scoreGapPlan: string;
    contentCoverageMaxed: boolean;
    serpCoverageMaxed: boolean;
    keywordDensityFocus: boolean;
  } {
    const gate =
      localGate ??
      resolveLocalGateContext({
        localAlignEnabled: false,
        localAlignEffective: false,
        scoreConfig,
      });
    const pointsToGo = localGatePointsToGo({
      gate,
      localScore: localResult.score,
      prediction: prediction ?? null,
    });
    const nearMissMargin =
      gate.mode === 'calibrated' ? SEMRUSH_NEAR_MISS_MARGIN : LOCAL_SEO_NEAR_MISS_MARGIN;
    const readabilityGap = 20 - localResult.breakdown.readability;
    const nearMiss = pointsToGo > 0 && pointsToGo <= nearMissMargin;
    const serpCoverageMaxed = localResult.breakdown.serpTermAlignment >= 25;
    const keywordDensityFocus =
      localResult.breakdown.keywordCoverage < 25 && serpCoverageMaxed;
    const contentCoverageMaxed =
      localResult.breakdown.keywordCoverage >= 25 &&
      localResult.breakdown.serpTermAlignment >= 25;
    const m = localResult.metrics;
    const semNearMissPoints =
      gate.mode === 'calibrated' ? pointsToGo <= SEMRUSH_NEAR_MISS_MARGIN : false;
    const calibratedFocus =
      gate.mode === 'calibrated'
        ? resolveCalibratedOptimizeFocus({
            gate,
            localResult,
            pointsToGo,
            content,
            targetKeyword: focusContext?.targetKeyword,
            articleTitle: focusContext?.articleTitle,
            competitorWordCount:
              focusContext?.competitorWordCount ?? focusContext?.targetWordCount,
          })
        : {
            serpPriority: false,
            readabilityPriority: false,
            fleschPriority: false,
            hardSentencePriority: false,
            titlePriority: false,
            wordCountTrimPriority: false,
            wordCountExpandPriority: false,
          };
    const titlePriority = calibratedFocus.titlePriority;
    const wordCountTrimPriority = calibratedFocus.wordCountTrimPriority;
    const competitorWords =
      focusContext?.competitorWordCount ?? focusContext?.targetWordCount ?? 0;
    const wordCountExpandGap =
      typeof competitorWords === 'number' && competitorWords > 0
        ? competitorWords - m.wordCount
        : 0;
    const wordCountExpandPriority =
      calibratedFocus.wordCountExpandPriority ||
      (!calibratedFocus.serpPriority &&
        !titlePriority &&
        shouldPrioritizeWordCountExpand(wordCountExpandGap));
    const resolvedTitle = resolveSemrushArticleTitle({
      content,
      targetKeyword: focusContext?.targetKeyword ?? '',
      articleTitle: focusContext?.articleTitle,
    });
    const hardSentencePriority = calibratedFocus.hardSentencePriority;
    const readabilityPriority =
      (!titlePriority &&
        !hardSentencePriority &&
        !wordCountTrimPriority &&
        !wordCountExpandPriority &&
        calibratedFocus.readabilityPriority) ||
      (!titlePriority &&
        !hardSentencePriority &&
        !wordCountTrimPriority &&
        !wordCountExpandPriority &&
        contentCoverageMaxed &&
        pointsToGo > 0) ||
      (!titlePriority &&
        !hardSentencePriority &&
        !wordCountTrimPriority &&
        !wordCountExpandPriority &&
        nearMiss &&
        ((gate.mode === 'calibrated' ? semNearMissPoints : pointsToGo <= 2) ||
          readabilityGap >= 2 ||
          m.longSentencesOver22 > 2 ||
          m.longParagraphsOver65 > 1 ||
          m.passiveVoiceHits > 6 ||
          (m.semrushComplexWordHits ?? 0) > 0 ||
          (m.hardToReadSentenceHits ?? 0) > 0));
    const serpPriority = calibratedFocus.serpPriority;
    const fleschPriority = calibratedFocus.fleschPriority;
    const suggestions = [...localResult.suggestions];
    const audit = auditReadability(content, m);
    const scoreGapPlan =
      gate.mode === 'calibrated'
        ? [
            `预测 Semrush 目标 ≥${gate.threshold}/10（实验室校准对齐）`,
            pointsToGo > 0
              ? `- 当前预测 ${prediction?.predictedSemrush ?? '—'}/10，还差 ${pointsToGo} 分`
              : '',
            fleschPriority && typeof m.fleschReadingEase === 'number'
              ? `- Flesch ${m.fleschReadingEase}，目标 ${m.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT} (±8)：简词、拆句（本地分已高时仍须做）`
              : '',
            serpPriority
              ? `- SERP 对齐 ${localResult.breakdown.serpTermAlignment}/25：补缺失实体词`
              : '',
            titlePriority
              ? `- 标题须 ≤${SEMRUSH_TITLE_MAX_CHARS} 字符、${SEMRUSH_TITLE_WORD_MIN}–${SEMRUSH_TITLE_WORD_MAX} 词（SWA 侧栏）`
              : '',
            wordCountExpandPriority
              ? `- 篇幅不足（当前 ${m.wordCount} 词，Semrush 目标约 ${competitorWords} 词）：优先扩写至目标，可加 FAQ`
              : '',
            wordCountTrimPriority
              ? `- 篇幅超标（当前 ${m.wordCount} 词）：删减至竞品/Brief 目标，禁止 inject FAQ`
              : '',
            hardSentencePriority && (m.hardToReadSentenceHits ?? 0) > 0
              ? `- 难读句 ${m.hardToReadSentenceHits} 处（须 ≤2）：只改 audit 列出的原句，禁止加实体词`
              : '',
            !hardSentencePriority &&
            readabilityPriority &&
            (m.hardToReadSentenceHits ?? 0) > 0
              ? `- 难读句 ${m.hardToReadSentenceHits} 处：逐句重写（≤22 词/句）`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : buildLocalScoreGapPlan(localResult, scoreConfig.localPassThreshold);

    if (gate.mode === 'calibrated' && pointsToGo > 0) {
      suggestions.unshift(
        `[Semrush 对齐] 预测 Semrush ${prediction?.predictedSemrush ?? '—'}/10，距 ${gate.threshold} 还差 ${pointsToGo} 分`,
      );
    }

    if (wordCountExpandPriority) {
      const competitor = focusContext?.competitorWordCount;
      const plan =
        typeof competitor === 'number' && competitor > 0
          ? buildSemrushWordCountPlan({
              content,
              competitorWordCount: competitor,
              apiReportedWords: focusContext?.semrushCurrentWordCount,
            })
          : null;
      const target =
        plan?.localExpandTarget ??
        focusContext?.competitorWordCount ??
        resolveOptimizeWordCountTarget(
          focusContext?.targetWordCount ?? m.wordCount,
          focusContext?.competitorWordCount,
        );
      const gap = Math.max(0, target - m.wordCount);
      const faqCount = Math.min(4, Math.max(2, Math.ceil(gap / 50)));
      const swaHint =
        plan?.swaGap != null && plan.swaGap > 0
          ? `SWA 统计约 ${plan.effectiveCurrentWords} 词 / 竞品标杆 ${competitor} 词（SWA 缺 ${plan.swaGap} 词），`
          : '';
      suggestions.unshift(
        `[Semrush 对齐·词数·必做] 当前 ${m.wordCount} 词，${swaHint}本地扩写至 ${target - 5}–${target} 词（缺 ${gap} 词，标杆 +5%）；可加 ${faqCount} 条 FAQ（每条 40–60 词），暂缓次要可读性修稿`,
      );
    }

    if (wordCountTrimPriority) {
      const competitor =
        focusContext?.competitorWordCount ?? focusContext?.targetWordCount ?? m.wordCount;
      const trimRange = resolveSemrushTrimWordTargetRange(competitor);
      suggestions.unshift(
        `[Semrush 对齐·篇幅] 当前 ${m.wordCount} 词，超过标杆约 ${competitor} 词的 ${Math.round(SEMRUSH_WORD_COUNT_TRIM_OVER_RATIO * 100)}%：只删重复与过渡句，压至 ${trimRange.min}–${trimRange.max} 词（标杆 +5%–+15%），禁止 inject FAQ`,
      );
    }

    if (titlePriority) {
      const titleIssues = analyzeSemrushTitleIssues(
        resolvedTitle,
        focusContext?.targetKeyword ? [focusContext.targetKeyword] : undefined,
      );
      for (const issue of titleIssues.slice(0, 2).reverse()) {
        suggestions.unshift(`[Semrush 对齐·标题] ${issue.message}`);
      }
      suggestions.unshift(
        `[Semrush 对齐·标题] 本轮只改 H1（≤${SEMRUSH_TITLE_MAX_CHARS} 字、${SEMRUSH_TITLE_WORD_MIN}–${SEMRUSH_TITLE_WORD_MAX} 词），禁止改正文`,
      );
    }

    if (serpPriority && localResult.recommendedKeywords.length > 0) {
      suggestions.unshift(
        `[Semrush 对齐·SERP] 补实体词（${localResult.breakdown.serpTermAlignment}/25）：${localResult.recommendedKeywords.slice(0, 8).join('、')}`,
      );
    }

    if (fleschPriority && typeof m.fleschReadingEase === 'number') {
      suggestions.unshift(
        `[Semrush 对齐·Flesch] 当前 ${m.fleschReadingEase}，目标约 ${m.fleschTarget ?? SEMRUSH_FLESCH_TARGET_DEFAULT}：缩短句子、替换复杂词（优先于加词/加段）`,
      );
    }

    if (hardSentencePriority && (m.hardToReadSentenceHits ?? 0) > 0) {
      suggestions.unshift(
        `[Semrush 对齐·难读句] ${m.hardToReadSentenceHits} 处须压到 ≤2：只改 audit 列出的原句，拆成 2 条短句`,
      );
    }

    if (readabilityPriority || hardSentencePriority || pointsToGo <= 2) {
      if (!wordCountExpandPriority && m.longSentencesOver22 > 2) {
        suggestions.unshift(
          `[可读性·必做] 将超长句从 ${m.longSentencesOver22} 条压到 ≤2 条（评分器按 >22 词计数，不是 25 词）`,
        );
      }
      if (m.longParagraphsOver65 > 1) {
        suggestions.unshift(
          `[可读性·必做] 将超长段从 ${m.longParagraphsOver65} 段压到 ≤1 段（>${LOCAL_PARAGRAPH_MAX_WORDS} 词/段）`,
        );
      }
      if (m.passiveVoiceHits > 6) {
        suggestions.unshift(
          `[可读性] 被动语态 ${m.passiveVoiceHits} 处，须减至 ≤6 处（可 +2 可读性分）`,
        );
      }
      if ((m.semrushComplexWordHits ?? 0) > 0) {
        suggestions.unshift(
          `[可读性·必做] 替换 ${m.semrushComplexWordHits} 处 Semrush 复杂词（如 traceability→clear records）`,
        );
      }
      if ((m.hardToReadSentenceHits ?? 0) > 0) {
        suggestions.unshift(
          `[可读性·必做] 重写 ${m.hardToReadSentenceHits} 处难读句（拆长句、减 and/or 并列）`,
        );
      }
    }

    if (pointsToGo === 1) {
      suggestions.unshift(
        serpCoverageMaxed
          ? '[+1 分模式] SERP 已满：只改 1 处可读性（替换 1 个复杂词或拆 1 条难读句），禁止加实体句'
          : '[+1 分模式] 只做 1 处最小改动：拆 1 条长句到 ≤22 词，或调密度到 0.8%–2.5%，或删 1 处被动；禁止加 SERP 凑句',
      );
    } else if (keywordDensityFocus) {
      suggestions.unshift(
        '[关键词密度] SERP 已满，本轮只调密度到 0.8%–2.5%（可 +4 分），禁止再凑实体词',
      );
    }

    return {
      suggestions,
      readabilityPriority,
      serpPriority,
      fleschPriority,
      hardSentencePriority,
      titlePriority,
      wordCountTrimPriority,
      wordCountExpandPriority,
      resolvedTitle,
      pointsToGo: pointsToGo > 0 ? pointsToGo : undefined,
      readabilityAudit:
        titlePriority ||
        wordCountExpandPriority ||
        hardSentencePriority ||
        readabilityPriority ||
        fleschPriority ||
        pointsToGo <= 2
          ? audit.promptText
          : undefined,
      scoreGapPlan,
      contentCoverageMaxed,
      serpCoverageMaxed,
      keywordDensityFocus,
    };
  }

export function auditReadability(
    content: string,
    metrics?: LocalSeoScoreResult['metrics'],
  ): {
    longSentenceCount: number;
    longParagraphCount: number;
    promptText: string;
  } {
    const countWords = (text: string) =>
      text.trim().split(/\s+/).filter(Boolean).length;

    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => countWords(s) >= 4);
    const longSentences = sentences.filter((s) => countWords(s) > 22);

    const bodyParagraphs = content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(
        (p) => p.length > 0 && !p.startsWith('#') && !p.startsWith('![') && !/^-\s+/.test(p),
      );
    const longParagraphs = bodyParagraphs.filter((p) => countWords(p) > LOCAL_PARAGRAPH_MAX_WORDS);

    const longSentenceCount = metrics?.longSentencesOver22 ?? longSentences.length;
    const longParagraphCount = metrics?.longParagraphsOver65 ?? longParagraphs.length;

    const samples = longSentences
      .slice(0, 5)
      .map((s) => `• "${s.slice(0, 100)}${s.length > 100 ? '…' : ''}" (${countWords(s)} words)`);

    const longLines = [
      `Scorer counts: ${longSentenceCount} sentences >22 words (need ≤2), ${longParagraphCount} paragraphs >${LOCAL_PARAGRAPH_MAX_WORDS} words (need ≤1).`,
    ];
    if (samples.length > 0) {
      longLines.push('Split EVERY sentence below to ≤22 words (keep facts, split clauses):', ...samples);
    }

    const hardHits = metrics?.hardToReadSentenceHits ?? 0;
    const hardBlock = formatHardToReadSentenceAuditBlock({
      hits: hardHits,
      samples: metrics?.hardToReadSentenceSamples,
    });

    return {
      longSentenceCount,
      longParagraphCount,
      promptText: [longLines.join('\n'), hardBlock].filter(Boolean).join('\n\n'),
    };
  }
