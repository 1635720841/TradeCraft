/**
 * 润色后本地预检分回归检查。
 *
 * 边界：
 * - 不负责：Semrush 复测（SeoCheckerService）
 */

import { scoreLocalSeo, type LocalSeoScoreResult } from '@wm/shared-core';
import { PARAPHRASE_LOCAL_SCORE_MAX_DROP } from '../../constants/paraphrase';

export interface ParaphraseRegressionInput {
  keyword: string;
  originalContent: string;
  paraphrasedContent: string;
  serpOrganic?: Array<{ title?: string; snippet?: string }>;
  targetWordCount: number;
  maxDrop?: number;
}

export interface ParaphraseRegressionResult {
  revert: boolean;
  scoreBefore: number;
  scoreAfter: number;
  drop: number;
  reason?: string;
  beforeBreakdown?: LocalSeoScoreResult['breakdown'];
  afterBreakdown?: LocalSeoScoreResult['breakdown'];
}

export function checkParaphraseLocalScoreRegression(
  input: ParaphraseRegressionInput,
): ParaphraseRegressionResult {
  const maxDrop = input.maxDrop ?? PARAPHRASE_LOCAL_SCORE_MAX_DROP;

  const before = scoreLocalSeo({
    keyword: input.keyword,
    content: input.originalContent,
    serpOrganic: input.serpOrganic,
    targetWordCount: input.targetWordCount,
  });
  const after = scoreLocalSeo({
    keyword: input.keyword,
    content: input.paraphrasedContent,
    serpOrganic: input.serpOrganic,
    targetWordCount: input.targetWordCount,
  });

  const drop = before.score - after.score;
  if (drop > maxDrop) {
    return {
      revert: true,
      scoreBefore: before.score,
      scoreAfter: after.score,
      drop,
      reason: `本地预检分下降 ${drop} 分（${before.score}→${after.score}），已保留 Semrush 优化稿`,
      beforeBreakdown: before.breakdown,
      afterBreakdown: after.breakdown,
    };
  }

  return {
    revert: false,
    scoreBefore: before.score,
    scoreAfter: after.score,
    drop,
    beforeBreakdown: before.breakdown,
    afterBreakdown: after.breakdown,
  };
}
