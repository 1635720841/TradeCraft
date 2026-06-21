/**
 * 校准样本快照 Semrush 上下文回填：历史快照缺字段时从正文/关键词重算。
 *
 * 边界：
 * - 不负责：DB 写入（只读回填，供训练特征提取）
 * - 不负责：Semrush RPA 执行
 */

import {
  findMissingSemrushKeywords,
  mergeSemrushKeywordLists,
} from '../providers/semrush/semrush-keyword-coverage.util';
import type { SeoAnalysisSnapshot } from './seo-analysis-snapshot.util';
import type { ScoreCalibrationSemrushContext } from '@wm/shared-core';

export interface ResolvedSnapshotSemrushContext {
  context: ScoreCalibrationSemrushContext;
  /** 缺词数是否由正文回填（非快照持久化字段） */
  missingKeywordsBackfilled: boolean;
}

/** 优先完整正文，其次 contentPreview（截断但仍可估缺词） */
export function resolveSnapshotContent(snapshot: SeoAnalysisSnapshot): string {
  const full = snapshot.content?.trim();
  if (full) return full;
  return snapshot.contentPreview?.trim() ?? '';
}

/** 从快照 submittedKeywords + 目标词合并关键词表 */
export function resolveSnapshotKeywordList(
  snapshot: SeoAnalysisSnapshot,
  jobTargetKeyword: string,
): string[] {
  return mergeSemrushKeywordLists(
    [jobTargetKeyword, snapshot.targetKeyword],
    snapshot.submittedKeywords,
  );
}

/** 解析训练用 Semrush 上下文；缺词数缺失且有正文时回填 */
export function resolveSnapshotSemrushContext(
  snapshot: SeoAnalysisSnapshot,
  jobTargetKeyword: string,
): ResolvedSnapshotSemrushContext {
  let missingKeywordCount = snapshot.semrushMissingKeywordCount;
  let missingKeywordsBackfilled = false;

  if (typeof missingKeywordCount !== 'number') {
    const content = resolveSnapshotContent(snapshot);
    if (content.length >= 80) {
      missingKeywordCount = findMissingSemrushKeywords(
        content,
        resolveSnapshotKeywordList(snapshot, jobTargetKeyword),
      ).length;
      missingKeywordsBackfilled = true;
    }
  }

  return {
    context: {
      competitorWordCount: snapshot.semrushCompetitorWordCount,
      missingKeywordCount,
      semrushNode: snapshot.semrushNode,
    },
    missingKeywordsBackfilled,
  };
}

/** 本地 metrics 词数回退：Semrush 当前词数缺失时用快照 contentWordCount */
export function resolveSnapshotLocalMetrics(
  snapshot: SeoAnalysisSnapshot,
): SeoAnalysisSnapshot['localMetrics'] {
  const metrics = snapshot.localMetrics;
  const wordCount = metrics?.wordCount ?? snapshot.contentWordCount;
  if (!metrics && wordCount <= 0) return undefined;
  return {
    keywordDensity: metrics?.keywordDensity ?? 0,
    matchedSerpTerms: metrics?.matchedSerpTerms ?? 0,
    totalSerpTerms: metrics?.totalSerpTerms ?? 0,
    h2Count: metrics?.h2Count ?? 0,
    longSentencesOver22: metrics?.longSentencesOver22 ?? 0,
    longParagraphsOver65: metrics?.longParagraphsOver65 ?? 0,
    passiveVoiceHits: metrics?.passiveVoiceHits ?? 0,
    wordCount,
    fleschReadingEase: metrics?.fleschReadingEase,
    fleschTarget: metrics?.fleschTarget,
    longSentenceSamples: metrics?.longSentenceSamples,
    longParagraphSamples: metrics?.longParagraphSamples,
    casualSentenceHits: metrics?.casualSentenceHits,
    casualSentenceSamples: metrics?.casualSentenceSamples,
  };
}
