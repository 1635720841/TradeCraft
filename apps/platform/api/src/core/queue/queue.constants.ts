/**
 * BullMQ 队列名常量。
 *
 * 边界：
 * - 不负责：Processor 实现（由 seo-factory 插件处理）
 */

/** seo-factory 文章生成队列 */
/** BullMQ 队列名禁止含 `:`，使用连字符分隔 projectType 与 taskName */
export const ARTICLE_JOB_QUEUE = 'seo-factory-article-job';

/** seo-factory Playwright / Semrush RPA 专用队列（低频限速） */
export const PLAYWRIGHT_QUEUE = 'seo-factory-playwright';
