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
