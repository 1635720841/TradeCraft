/** Brief 人工确认：状态存于 briefData，避免新增 JobStatus */

export type BriefApprovalStatus = 'pending' | 'approved' | 'skipped';

export interface BriefApprovalMeta {
  approvalStatus?: BriefApprovalStatus;
  approvedAt?: string;
  approvedBy?: string;
}

export interface SiteWorkflowSettings {
  requireBriefApproval?: boolean;
  /** 默认开启；仅显式 false 时跳过 M7 原创表达优化 */
  enableParaphrase?: boolean;
}

export function parseSiteWorkflowSettings(settings: unknown): SiteWorkflowSettings {
  const raw = (settings ?? {}) as SiteWorkflowSettings;
  return {
    requireBriefApproval: raw.requireBriefApproval === true,
    enableParaphrase: raw.enableParaphrase !== false,
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
