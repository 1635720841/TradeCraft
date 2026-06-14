/**
 * seo-factory 文章任务 API。
 *
 * 边界：
 * - 不负责：UI 展示（见 views/projects/seo-factory/）
 */

import { http } from "@/utils/http";
import type {
  ArticleJobItem,
  BatchArticleJobsResult,
  CreateArticleJobPayload,
  CreateBatchArticleJobsPayload,
  CmsPublishResult,
  DraftEditHistoryResult,
  DraftImageUploadResult,
  DraftResolveStaleAction,
  PatchArticleDraftPayload,
  PatchArticleDraftResult,
  PendingReviewItem,
  RewriteArticleJobPayload,
  SeoFactoryProjectStats,
  WmApiResponse
} from "./types";

function projectBase(projectId: string) {
  return `/api/v1/projects/${projectId}/article-jobs`;
}

/** 创建文章任务（202 异步入队） */
export async function createArticleJob(
  projectId: string,
  payload: CreateArticleJobPayload
): Promise<ArticleJobItem> {
  const res = await http.request<WmApiResponse<ArticleJobItem>>(
    "post",
    projectBase(projectId),
    { data: payload }
  );
  return res.data;
}

/** 批量创建文章任务（站点采集或关键词列表） */
export async function createBatchArticleJobs(
  projectId: string,
  payload: CreateBatchArticleJobsPayload
): Promise<BatchArticleJobsResult> {
  const res = await http.request<WmApiResponse<BatchArticleJobsResult>>(
    "post",
    `${projectBase(projectId)}/batch`,
    { data: payload }
  );
  return res.data;
}

/** 任务列表（分页） */
export async function listArticleJobs(
  projectId: string,
  page = 1,
  limit = 20
): Promise<WmApiResponse<ArticleJobItem[]>> {
  return http.request<WmApiResponse<ArticleJobItem[]>>(
    "get",
    projectBase(projectId),
    { params: { page, limit } }
  );
}

/** 项目工作台统计 */
export async function getSeoFactoryProjectStats(
  projectId: string
): Promise<SeoFactoryProjectStats> {
  const res = await http.request<WmApiResponse<SeoFactoryProjectStats>>(
    "get",
    `${projectBase(projectId)}/stats/summary`
  );
  return res.data;
}

/** 待 YMYL 人工审核列表 */
export async function listPendingReviews(
  projectId: string,
  page = 1,
  limit = 20
): Promise<WmApiResponse<PendingReviewItem[]>> {
  return http.request<WmApiResponse<PendingReviewItem[]>>(
    "get",
    `${projectBase(projectId)}/reviews/pending`,
    { params: { page, limit } }
  );
}

/** 通过 YMYL 人工审核并触发导出 */
export async function approveArticleReview(
  projectId: string,
  jobId: string,
  note?: string
): Promise<ArticleJobItem> {
  const res = await http.request<WmApiResponse<ArticleJobItem>>(
    "post",
    `${projectBase(projectId)}/${jobId}/review/approve`,
    { data: note ? { note } : {} }
  );
  return res.data;
}

/** 驳回 YMYL 人工审核 */
export async function rejectArticleReview(
  projectId: string,
  jobId: string,
  note?: string
): Promise<ArticleJobItem> {
  const res = await http.request<WmApiResponse<ArticleJobItem>>(
    "post",
    `${projectBase(projectId)}/${jobId}/review/reject`,
    { data: note ? { note } : {} }
  );
  return res.data;
}

/** 任务详情 */
export async function getArticleJob(
  projectId: string,
  jobId: string
): Promise<ArticleJobItem> {
  const res = await http.request<WmApiResponse<ArticleJobItem>>(
    "get",
    `${projectBase(projectId)}/${jobId}`
  );
  return res.data;
}

/** 失败任务重新入队（202 异步） */
export async function retryArticleJob(
  projectId: string,
  jobId: string
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/retry`);
  return res.data;
}

/** 手动触发 Semrush RPA 检测当前初稿（202 异步） */
export async function triggerSemrushCheck(
  projectId: string,
  jobId: string
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/semrush-check`);
  return res.data;
}

/** 取消进行中的 Semrush 检测 */
export async function cancelSemrushCheck(
  projectId: string,
  jobId: string
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/semrush-check/cancel`);
  return res.data;
}

/** 手动触发 AI 重写（202 异步） */
export async function triggerArticleRewrite(
  projectId: string,
  jobId: string,
  payload: RewriteArticleJobPayload
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/rewrite`, { data: payload });
  return res.data;
}

/** 采纳 AI 重写候选版本（默认重新跑本地 SEO + Semrush 评分） */
export async function acceptArticleRewrite(
  projectId: string,
  jobId: string,
  options: { rerunLocalSeo?: boolean; rerunSemrush?: boolean } = {}
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/rewrite/accept`, {
    data: {
      rerunLocalSeo: options.rerunLocalSeo !== false,
      rerunSemrush: options.rerunSemrush !== false
    }
  });
  return res.data;
}

/** 放弃 AI 重写候选版本 */
export async function discardArticleRewrite(
  projectId: string,
  jobId: string
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/rewrite/discard`);
  return res.data;
}

/** 手动编辑稿件（标题 / Meta / 正文 Markdown） */
export async function patchArticleDraft(
  projectId: string,
  jobId: string,
  payload: PatchArticleDraftPayload
): Promise<PatchArticleDraftResult> {
  const res = await http.request<WmApiResponse<PatchArticleDraftResult>>(
    "patch",
    `${projectBase(projectId)}/${jobId}/draft`,
    { data: payload }
  );
  return res.data;
}

/** 稿件手动编辑历史 */
export async function listArticleDraftHistory(
  projectId: string,
  jobId: string
): Promise<DraftEditHistoryResult> {
  const res = await http.request<WmApiResponse<DraftEditHistoryResult>>(
    "get",
    `${projectBase(projectId)}/${jobId}/draft/history`
  );
  return res.data;
}

/** 回滚至某次编辑前的快照 */
export async function rollbackArticleDraft(
  projectId: string,
  jobId: string,
  historyId: string,
  postSaveAction?: PatchArticleDraftPayload["postSaveAction"]
): Promise<PatchArticleDraftResult> {
  const res = await http.request<WmApiResponse<PatchArticleDraftResult>>(
    "post",
    `${projectBase(projectId)}/${jobId}/draft/rollback`,
    { data: { historyId, postSaveAction } }
  );
  return res.data;
}

/** 编辑后消除 stale 标记（Banner 快捷操作） */
export async function resolveArticleDraftStale(
  projectId: string,
  jobId: string,
  action: DraftResolveStaleAction
): Promise<PatchArticleDraftResult> {
  const res = await http.request<WmApiResponse<PatchArticleDraftResult>>(
    "post",
    `${projectBase(projectId)}/${jobId}/draft/resolve-stale`,
    { data: { action } }
  );
  return res.data;
}

/** 上传稿件正文插图（本地上传，最大 5MB） */
export async function uploadArticleDraftImage(
  projectId: string,
  jobId: string,
  file: File
): Promise<DraftImageUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await http.request<WmApiResponse<DraftImageUploadResult>>(
    "post",
    `${projectBase(projectId)}/${jobId}/draft/images`,
    {
      data: formData,
      headers: { "Content-Type": "multipart/form-data" }
    }
  );
  return res.data;
}

/** 下载 M10 导出的 HTML（需登录态） */
export async function downloadArticleExportHtml(
  projectId: string,
  jobId: string
): Promise<Blob> {
  return downloadArticleExport(projectId, jobId, "html");
}

/** 下载 M10 导出的 JSON-LD（需登录态） */
export async function downloadArticleExportJsonLd(
  projectId: string,
  jobId: string
): Promise<Blob> {
  return downloadArticleExport(projectId, jobId, "jsonld");
}

/** 下载 M10 导出资产包 zip（HTML + JSON-LD + images/ + meta.txt） */
export async function downloadArticleExportPackage(
  projectId: string,
  jobId: string
): Promise<Blob> {
  return http.request<Blob>(
    "get",
    `${projectBase(projectId)}/${jobId}/export/package`,
    { responseType: "blob" }
  );
}

function downloadArticleExport(
  projectId: string,
  jobId: string,
  kind: "html" | "jsonld"
): Promise<Blob> {
  return http.request<Blob>(
    "get",
    `${projectBase(projectId)}/${jobId}/export/${kind}`,
    { responseType: "blob" }
  );
}

/** 发布到站点已配置的 WordPress（默认 draft） */
export async function publishArticleJob(
  projectId: string,
  jobId: string,
  payload: { status?: "draft" | "publish" } = {}
): Promise<CmsPublishResult> {
  const res = await http.request<WmApiResponse<CmsPublishResult>>(
    "post",
    `${projectBase(projectId)}/${jobId}/publish`,
    { data: payload }
  );
  return res.data;
}
