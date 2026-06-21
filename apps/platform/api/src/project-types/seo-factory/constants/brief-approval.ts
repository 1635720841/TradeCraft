/** Brief 人工确认：状态存于 briefData，避免新增 JobStatus */

export type BriefApprovalStatus = 'pending' | 'approved' | 'skipped';

export interface BriefApprovalMeta {
  approvalStatus?: BriefApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
}

import type { SiteSeoScoreSettings } from './site-seo-score-settings';

export interface SiteWorkflowSettings extends SiteSeoScoreSettings {
  requireBriefApproval?: boolean;
  /** 默认开启；仅显式 false 时跳过 M7 原创表达优化 */
  enableParaphrase?: boolean;
  /** 默认开启；仅显式 false 时跳过 BFL 自动配图 */
  enableIllustration?: boolean;
  /** 默认开启；M6 记录校准预测 vs Semrush 真分 */
  scoreCalibrationShadow?: boolean;
  /** 显式 true 时：高置信度优化轮可降频 Semrush RPA（终检仍会做确认 RPA） */
  scoreCalibrationReduceRpa?: boolean;
  /** 显式 true 且模型生产就绪时：本地进门闸改用校准预测 Semrush（与 semrushPassThreshold 同线） */
  scoreCalibrationLocalAlign?: boolean;
}

export function parseSiteWorkflowSettings(settings: unknown): SiteWorkflowSettings {
  const raw = (settings ?? {}) as SiteWorkflowSettings;
  return {
    requireBriefApproval: raw.requireBriefApproval === true,
    enableParaphrase: raw.enableParaphrase !== false,
    enableIllustration: raw.enableIllustration !== false,
    scoreCalibrationShadow: raw.scoreCalibrationShadow !== false,
    scoreCalibrationReduceRpa: raw.scoreCalibrationReduceRpa === true,
    scoreCalibrationLocalAlign: raw.scoreCalibrationLocalAlign === true,
  };
}

export function getBriefApprovalMeta(briefData: unknown): BriefApprovalMeta {
  return (briefData ?? {}) as BriefApprovalMeta;
}

export function isBriefApprovalPending(briefData: unknown): boolean {
  return getBriefApprovalMeta(briefData).approvalStatus === 'pending';
}

export function isBriefApprovedOrSkipped(briefData: unknown): boolean {
  const status = getBriefApprovalMeta(briefData).approvalStatus;
  return status === 'approved' || status === 'skipped';
}

export function withBriefApproval(
  briefData: unknown,
  patch: BriefApprovalMeta,
): Record<string, unknown> {
  return { ...((briefData ?? {}) as Record<string, unknown>), ...patch };
}
