/**
 * SEO 查分模块共享类型与常量。
 */

import type { SeoScore } from '@wm/provider-interfaces';
import type { SeoOptimizeHistoryEntry } from '../../utils/seo-pipeline.util';

export interface WorkflowProgress {
  phase:
    | 'local-scoring'
    | 'local'
    | 'semrush-check'
    | 'semrush'
    | 'semrush-queue'
    | 'paraphrasing';
  round?: number;
  maxRounds?: number;
  message: string;
  localScore?: number;
  semrushScore?: number;
  waitingAhead?: number;
  updatedAt: string;
}

export interface SerpOrganicRow {
  title?: string;
  snippet?: string;
}

export interface OptimizeHistoryEntry extends SeoOptimizeHistoryEntry {}

export interface PersistedSeoCheckData {
  optimizationRerun?: {
    reason?: 'gsc_underperform' | 'manual';
    requestedAt?: string;
  };
  local?: {
    score?: number;
    passed?: boolean;
    predictedSemrush?: number;
    gateMode?: 'legacy' | 'calibrated';
  };
  semrush?: {
    skipped?: boolean;
    passed?: boolean;
    overall?: number;
    suggestions?: string[];
    node?: string;
    nodeLabel?: string;
    suggestionDetails?: SeoScore['suggestionDetails'];
    actionableIssues?: SeoScore['actionableIssues'];
    analysisSource?: SeoScore['analysisSource'];
    apiUrls?: string[];
    semrushCompetitorWordCount?: number;
    semrushCurrentWordCount?: number;
    semrushReadabilityScore?: number;
    semrushEvaluationRoute?: string;
    semrushEvaluationContentFingerprint?: string;
    semrushTargetKeywords?: string[];
    semrushRecommendedKeywords?: string[];
    semrushMissingTargetKeywords?: string[];
    semrushMissingRecommendedKeywords?: string[];
    submittedKeywords?: string[];
    keywordCoverage?: SeoScore['keywordCoverage'];
    semrushCheckRecord?: SeoScore['semrushCheckRecord'];
  };
}

export interface SemrushPlanningFeedback {
  semrushCompetitorWordCount?: number;
  semrushTargetKeywords?: string[];
  semrushRecommendedKeywords?: string[];
  semrushMissingTargetKeywords?: string[];
  semrushMissingRecommendedKeywords?: string[];
  suggestionDetails?: SeoScore['suggestionDetails'];
  actionableIssues?: SeoScore['actionableIssues'];
}

export const GSC_UNDERPERFORM_OPTIMIZE_HINTS = [
  '搜索表现偏弱：强化开篇与标题一致性，首段直接回答搜索意图',
  '对照竞品补充高价值信息点，提升点击动机与页面深度',
];
