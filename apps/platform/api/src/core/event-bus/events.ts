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

/** 成员邀请 */
export const MEMBER_INVITED_EVENT = 'member.invited';

export interface MemberInvitedPayload {
  organizationId: string;
  email: string;
  invitedById: string;
  inviteUrl: string;
}

/** 项目访问申请 */
export const ACCESS_REQUEST_CREATED_EVENT = 'access_request.created';

export interface AccessRequestCreatedPayload {
  organizationId: string;
  projectId: string;
  requestId: string;
  userId: string;
  userEmail: string;
  projectName: string;
  message?: string;
}

/** 文章指派 */
export const ARTICLE_ASSIGNED_EVENT = 'article.assigned';

export interface ArticleAssignedPayload {
  organizationId: string;
  projectId: string;
  jobId: string;
  targetKeyword: string;
  assigneeUserId: string;
  assignedById: string;
}

/** 文章评论 */
export const ARTICLE_COMMENT_ADDED_EVENT = 'article.comment_added';

export interface ArticleCommentAddedPayload {
  organizationId: string;
  projectId: string;
  jobId: string;
  targetKeyword: string;
  commentId: string;
  authorUserId: string;
  assigneeUserIds: string[];
}

/** 计费变更申请 */
export const BILLING_REQUEST_CREATED_EVENT = 'billing_request.created';

export interface BillingRequestCreatedPayload {
  organizationId: string;
  requestId: string;
  type: string;
  requestedById: string;
}
