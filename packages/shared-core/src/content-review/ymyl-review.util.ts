/**
 * YMYL 人工审核状态解析（跨平台/插件共享）。
 */

export interface YmylReviewResult {
  requires_human_review: boolean;
  categories: string[];
  matchedSignals: string[];
  reviewedAt: string;
  humanReviewStatus?: 'pending' | 'approved' | 'rejected';
  humanReviewNote?: string;
  humanReviewedAt?: string;
  humanReviewedBy?: string;
}

export function getYmylReview(seoCheckData: unknown): YmylReviewResult | null {
  const record = (seoCheckData ?? {}) as { ymylReview?: YmylReviewResult };
  return record.ymylReview ?? null;
}

/** M10 导出前校验：YMYL 需人工审核时须审核通过才可发布 HTML */
export function canPublishArticle(seoCheckData: unknown): boolean {
  const review = getYmylReview(seoCheckData);
  if (review?.requires_human_review !== true) return true;
  return review.humanReviewStatus === 'approved';
}

export function isPendingHumanReview(seoCheckData: unknown): boolean {
  const review = getYmylReview(seoCheckData);
  if (!review?.requires_human_review) return false;
  return !review.humanReviewStatus || review.humanReviewStatus === 'pending';
}

export function isYmylReviewCompleted(seoCheckData: unknown): boolean {
  return Boolean(getYmylReview(seoCheckData)?.reviewedAt);
}
