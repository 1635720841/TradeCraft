/**
 * 内容评分发布门控：校准分是否可替代过期 Semrush 终检要求。
 *
 * 边界：
 * - 不负责：HTTP / DB
 * - 不负责：M6 降频 RPA 决策（score-calibration-runtime）
 */

import type { ScoreCalibrationConfidence } from './score-calibration-model';

export type ContentScoreSnapshotSource = 'draft_editor' | 'm6_pipeline' | 'm6_proxy';

export interface ContentScoreSnapshot {
  overall: number;
  passed: boolean;
  passThreshold: number;
  pointsToGo: number;
  confidence: ScoreCalibrationConfidence;
  modelReady: boolean;
  usedFallback: boolean;
  localScore: number;
  primaryNode: {
    key: string;
    label: string;
    hint: string;
  };
  missingKeywordCount: number;
  contentHash: string;
  scoredAt: string;
  source: ContentScoreSnapshotSource;
}

/** 正文指纹（前后端一致，不依赖 Node crypto） */
export function hashArticleContentFingerprint(content: string): string {
  const normalized = content.trim();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return `djb2-${(hash >>> 0).toString(16)}-${normalized.length}`;
}

/** 高置信校准分是否可替代「Semrush 终检已过期」待办（需站点开启降频 RPA） */
export function canContentScoreSubstituteSemrushStale(input: {
  snapshot?: ContentScoreSnapshot | null;
  currentContent: string;
  reduceRpaEnabled?: boolean;
}): boolean {
  if (!input.reduceRpaEnabled) return false;
  const snapshot = input.snapshot;
  if (!snapshot) return false;
  if (snapshot.contentHash !== hashArticleContentFingerprint(input.currentContent)) {
    return false;
  }
  if (!snapshot.passed || !snapshot.modelReady || snapshot.usedFallback) {
    return false;
  }
  return snapshot.confidence === 'high';
}
