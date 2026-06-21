/**
 * 评分校准就绪状态：驱动实验室与管理端降频 RPA 门控展示。
 *
 * 边界：
 * - 不负责：模型训练（score-calibration-model）
 */

import type { ScoreCalibrationModel } from './score-calibration-model';
import {
  SCORE_CALIBRATION_MIN_JOBS_FOR_HOLDOUT,
  SCORE_CALIBRATION_MIN_SAMPLES,
} from './score-calibration-model';

export type ScoreCalibrationReadinessState =
  | 'insufficient'
  | 'shadow_only'
  | 'holdout_unstable'
  | 'trial_ready'
  | 'production_ready';

/** Holdout 稳定所需最少验证样本数 */
export const SCORE_CALIBRATION_HOLDOUT_STABLE_MIN = 10;

/** 降频 RPA 试验门槛：验证样本数 */
export const SCORE_CALIBRATION_TRIAL_HOLDOUT_MIN = 8;

/** 降频 RPA 生产门槛：验证样本数（与 high 置信度一致） */
export const SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MIN = 15;

/** 降频 RPA 生产门槛：holdout MAE */
export const SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MAE = 0.35;

/** 降频 RPA 试验门槛：holdout MAE */
export const SCORE_CALIBRATION_TRIAL_HOLDOUT_MAE = 0.45;

export interface ScoreCalibrationReadinessGaps {
  samplesNeeded: number;
  jobsNeeded: number;
  holdoutSamplesNeeded: number;
}

export type ScoreCalibrationPrimaryAction =
  | 'collect_rpa_samples'
  | 'review_holdout_errors'
  | 'enable_reduce_rpa_trial'
  | 'enable_reduce_rpa_production'
  | 'none';

export interface ScoreCalibrationReadiness {
  state: ScoreCalibrationReadinessState;
  /** 是否建议尝试开启降频 RPA（试验级） */
  canTrialReduceRpa: boolean;
  /** 降频 RPA 在生产门控下是否真的会生效（high 置信 + holdout） */
  reduceRpaEffective: boolean;
  /** 实验室/设置页推荐下一步（前端映射文案与跳转） */
  primaryAction: ScoreCalibrationPrimaryAction;
  gaps: ScoreCalibrationReadinessGaps;
  holdoutSampleCount: number;
  holdoutMae: number | null;
  trainSampleCount: number;
}

export function resolveScoreCalibrationPrimaryAction(
  state: ScoreCalibrationReadinessState,
): ScoreCalibrationPrimaryAction {
  switch (state) {
    case 'insufficient':
    case 'shadow_only':
      return 'collect_rpa_samples';
    case 'holdout_unstable':
      return 'review_holdout_errors';
    case 'trial_ready':
      return 'enable_reduce_rpa_trial';
    case 'production_ready':
      return 'enable_reduce_rpa_production';
    default:
      return 'none';
  }
}

export function resolveScoreCalibrationReadiness(input: {
  pairCount: number;
  jobCount: number;
  model: ScoreCalibrationModel | null;
}): ScoreCalibrationReadiness {
  const holdoutSampleCount = input.model?.holdoutSampleCount ?? 0;
  const holdoutMae = input.model?.holdoutMae ?? null;
  const trainSampleCount = input.model?.trainSampleCount ?? input.model?.sampleCount ?? 0;

  const samplesNeeded = Math.max(0, SCORE_CALIBRATION_MIN_SAMPLES - input.pairCount);
  const jobsNeeded = Math.max(0, SCORE_CALIBRATION_MIN_JOBS_FOR_HOLDOUT - input.jobCount);
  const holdoutSamplesNeeded = Math.max(
    0,
    SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MIN - holdoutSampleCount,
  );

  const gaps: ScoreCalibrationReadinessGaps = {
    samplesNeeded,
    jobsNeeded,
    holdoutSamplesNeeded,
  };

  if (!input.model || input.pairCount < SCORE_CALIBRATION_MIN_SAMPLES) {
    return {
      state: 'insufficient',
      canTrialReduceRpa: false,
      reduceRpaEffective: false,
      primaryAction: 'collect_rpa_samples',
      gaps,
      holdoutSampleCount,
      holdoutMae,
      trainSampleCount,
    };
  }

  if (holdoutSampleCount <= 0) {
    return {
      state: 'shadow_only',
      canTrialReduceRpa: false,
      reduceRpaEffective: false,
      primaryAction: 'collect_rpa_samples',
      gaps,
      holdoutSampleCount,
      holdoutMae,
      trainSampleCount,
    };
  }

  const trialReady =
    holdoutSampleCount >= SCORE_CALIBRATION_TRIAL_HOLDOUT_MIN &&
    holdoutMae !== null &&
    holdoutMae <= SCORE_CALIBRATION_TRIAL_HOLDOUT_MAE;

  const productionReady =
    holdoutSampleCount >= SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MIN &&
    trainSampleCount >= 30 &&
    holdoutMae !== null &&
    holdoutMae <= SCORE_CALIBRATION_PRODUCTION_HOLDOUT_MAE;

  if (productionReady) {
    return {
      state: 'production_ready',
      canTrialReduceRpa: true,
      reduceRpaEffective: true,
      primaryAction: 'enable_reduce_rpa_production',
      gaps,
      holdoutSampleCount,
      holdoutMae,
      trainSampleCount,
    };
  }

  if (trialReady) {
    return {
      state: 'trial_ready',
      canTrialReduceRpa: true,
      reduceRpaEffective: false,
      primaryAction: 'enable_reduce_rpa_trial',
      gaps,
      holdoutSampleCount,
      holdoutMae,
      trainSampleCount,
    };
  }

  return {
    state: 'holdout_unstable',
    canTrialReduceRpa: false,
    reduceRpaEffective: false,
    primaryAction: 'review_holdout_errors',
    gaps,
    holdoutSampleCount,
    holdoutMae,
    trainSampleCount,
  };
}
