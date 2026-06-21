/**
 * 评分校准实验室：手动录入样本（ArticleJob 持久化 + 旧 project.config 迁移）。
 *
 * 边界：
 * - 不负责：HTTP（ScoreCalibrationService）
 * - 不负责：模型训练（shared-core）
 */

import { randomUUID } from 'node:crypto';
import type { SeoAnalysisSnapshot } from './seo-analysis-snapshot.util';

export const SCORE_CALIBRATION_MANUAL_SAMPLES_KEY = 'scoreCalibrationManualSamples';
export const CALIBRATION_LAB_IMPORT_FLAG = 'calibrationLabImport';
export const MAX_MANUAL_CALIBRATION_SAMPLES = 120;
export const CALIBRATION_LAB_JOB_ID_PREFIX = 'lab-manual-';

export interface StoredManualCalibrationSample {
  jobId: string;
  traceId: string;
  snapshot: SeoAnalysisSnapshot;
  sourceNote?: string;
  importedAt: string;
}

export function isCalibrationLabImportSeoCheckData(seoCheckData: unknown): boolean {
  if (!seoCheckData || typeof seoCheckData !== 'object') return false;
  return (seoCheckData as Record<string, unknown>)[CALIBRATION_LAB_IMPORT_FLAG] === true;
}

export function isCalibrationLabImportJobId(jobId: string): boolean {
  return jobId.startsWith(CALIBRATION_LAB_JOB_ID_PREFIX);
}

export function buildCalibrationLabJobId(): string {
  return `${CALIBRATION_LAB_JOB_ID_PREFIX}${randomUUID()}`;
}

export function readManualCalibrationSamples(config: unknown): StoredManualCalibrationSample[] {
  if (!config || typeof config !== 'object') return [];
  const raw = (config as Record<string, unknown>)[SCORE_CALIBRATION_MANUAL_SAMPLES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isStoredManualSample);
}

export function clearManualCalibrationSamplesConfig(config: unknown): Record<string, unknown> {
  const base =
    config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {};
  delete base[SCORE_CALIBRATION_MANUAL_SAMPLES_KEY];
  return base;
}

function isStoredManualSample(value: unknown): value is StoredManualCalibrationSample {
  if (!value || typeof value !== 'object') return false;
  const row = value as StoredManualCalibrationSample;
  return (
    typeof row.jobId === 'string' &&
    typeof row.traceId === 'string' &&
    typeof row.importedAt === 'string' &&
    row.snapshot !== null &&
    typeof row.snapshot === 'object' &&
    typeof row.snapshot.id === 'string' &&
    row.snapshot.kind === 'semrush_manual_check'
  );
}
