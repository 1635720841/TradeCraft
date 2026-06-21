/**
 * 内容评分快照：写入 seoCheckData.contentScore。
 *
 * 边界：
 * - 不负责：HTTP（ArticleScoreService / SeoCheckerService）
 */

import {
  hashArticleContentFingerprint,
  normalizeArticleScoreContent,
  type ContentScoreSnapshot,
  type ContentScoreSnapshotSource,
} from '@wm/shared-core';
import type { ArticleContentScoreResult } from './article-content-score.util';

export function buildContentScoreSnapshot(
  result: ArticleContentScoreResult,
  input: {
    content: string;
    source: ContentScoreSnapshotSource;
  },
): ContentScoreSnapshot {
  const normalized = normalizeArticleScoreContent(input.content);
  return {
    overall: result.overall,
    passed: result.passed,
    passThreshold: result.passThreshold,
    pointsToGo: result.pointsToGo,
    confidence: result.confidence,
    modelReady: result.modelReady,
    usedFallback: result.usedFallback,
    localScore: result.localScore,
    primaryNode: result.primaryNode,
    missingKeywordCount: result.missingKeywordCount,
    contentHash: hashArticleContentFingerprint(normalized),
    scoredAt: new Date().toISOString(),
    source: input.source,
  };
}
