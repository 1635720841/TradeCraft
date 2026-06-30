/**
 * SEO 查分流水线：本地阶段与 Semrush 阶段共享类型。
 */

import type { LocalSeoScoreResult } from '@wm/shared-core';
import type { LocalGateContext } from '../../utils/score-calibration-local-align.util';
import type { ScoreCalibrationRuntime } from '../../utils/score-calibration-runtime.util';
import type { CalibrationShadowEntry } from '../../utils/score-calibration-runtime.util';
import type { ResolvedSiteSeoScoreConfig } from '../../constants/site-seo-score-settings';
import type { LlmJobContext } from '../llm/llm.service';
import type { OptimizeHistoryEntry, PersistedSeoCheckData, SerpOrganicRow } from './seo-checker.types';
import type { buildLocalGateEvaluation } from './seo-checker-gate.util';

export interface PostDraftPipelineJob {
  siteId: string;
  draftData: unknown;
  serpData: unknown;
  briefData: unknown;
  localSeoScore: number | null;
  semrushScore: number | null;
  seoCheckData: unknown;
  site: { settings: unknown } | null;
}

export interface PostDraftPipelineSetup {
  scoreConfig: ResolvedSiteSeoScoreConfig;
  roundCapOptions: { strictCap: boolean };
  content: string;
  articleTitle?: string;
  serpData: { organic?: SerpOrganicRow[] } | null;
  briefData: {
    outline?: { targetWordCount?: number };
  } | null;
  optimizeHistory: OptimizeHistoryEntry[];
  seoCheck: PersistedSeoCheckData;
  briefTargetWordCount: number;
  semrushCompetitorWordCount?: number;
  targetWordCount: number;
  localEvaluateHints?: { competitorWordCount: number };
  calibrationRuntime: ScoreCalibrationRuntime;
  localGate: LocalGateContext;
  calibrationShadowLog: CalibrationShadowEntry[];
  forceRerun: boolean;
  localAlreadyPassed: boolean;
  semrushResumable: boolean;
  forceLocalForWordGap: boolean;
  skipLocalPipeline: boolean;
}

export type LocalGateEvaluation = ReturnType<typeof buildLocalGateEvaluation>;

export interface PostDraftLocalPipelineInput {
  ctx: LlmJobContext;
  job: PostDraftPipelineJob;
  setup: PostDraftPipelineSetup;
  initialLocalResult: LocalSeoScoreResult;
}

export interface PostDraftLocalPipelineResult {
  currentContent: string;
  localResult: LocalSeoScoreResult;
  optimizeRounds: number;
  finalGateEvaluation: LocalGateEvaluation;
  recommendedKeywords: string[];
  skipLocalPipeline: boolean;
}

export interface PostDraftSemrushPipelineInput {
  ctx: LlmJobContext;
  job: PostDraftPipelineJob;
  setup: PostDraftPipelineSetup;
  local: PostDraftLocalPipelineResult;
}
