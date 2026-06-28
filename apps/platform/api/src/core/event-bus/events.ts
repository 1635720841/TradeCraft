/**
 * 全局事件名与载荷类型定义。
 *
 * 边界：
 * - 不负责：事件发布/订阅实现（使用 NestJS EventEmitter2）
 */

/** 文章生成完成事件名 */
export const ARTICLE_COMPLETED_EVENT = 'article.completed';

export interface ArticleCompletedPayload {
  traceId: string;
  organizationId: string;
  projectId: string;
  jobId: string;
}

/** 大纲待人工确认 */
export const ARTICLE_BRIEF_PENDING_EVENT = 'article.brief_pending';

export interface ArticleBriefPendingPayload {
  traceId: string;
  organizationId: string;
  projectId: string;
  jobId: string;
  targetKeyword: string;
}

/** 文章任务失败 */
export const ARTICLE_FAILED_EVENT = 'article.failed';

export interface ArticleFailedPayload {
  traceId: string;
  organizationId: string;
  projectId: string;
  jobId: string;
  targetKeyword: string;
  errorMessage: string;
}

/** 企业配额偏低 */
export const ORG_QUOTA_LOW_EVENT = 'org.quota_low';

export interface OrgQuotaLowPayload {
  organizationId: string;
  remaining: number;
  monthlyQuota: number;
  percentRemaining: number;
}
