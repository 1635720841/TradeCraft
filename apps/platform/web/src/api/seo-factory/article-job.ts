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
  RewriteArticleJobPayload,
  SeoFactoryProjectStats,
  WmApiResponse
} from "./types";
import { seoFactoryApiPath } from "./paths";

function projectBase(projectId: string) {
  return seoFactoryApiPath(projectId, "article-jobs");
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
  limit = 20,
  options: {
    briefPending?: boolean;
    generating?: boolean;
    cmsPublishFailed?: boolean;
    cmsPublishPending?: boolean;
    staleDraft?: boolean;
    reviewPending?: boolean;
    assignedToMe?: boolean;
    siteOwner?: "me";
    status?: "FAILED";
    siteId?: string;
  } = {}
): Promise<WmApiResponse<ArticleJobItem[]>> {
  const params: Record<string, string | number> = { page, limit };
  if (options.briefPending) params.briefPending = "1";
  if (options.generating) params.generating = "1";
  if (options.cmsPublishFailed) params.cmsPublishFailed = "1";
  if (options.cmsPublishPending) params.cmsPublishPending = "1";
  if (options.staleDraft) params.staleDraft = "1";
  if (options.reviewPending) params.reviewPending = "1";
  if (options.assignedToMe) params.assignedToMe = "1";
  if (options.siteOwner === "me") params.siteOwner = "me";
  if (options.status === "FAILED") params.status = "FAILED";
  if (options.siteId) params.siteId = options.siteId;
  return http.request<WmApiResponse<ArticleJobItem[]>>(
    "get",
    projectBase(projectId),
    { params }
  );
}

/** 项目工作台统计 */
export async function getSeoFactoryProjectStats(
  projectId: string,
  siteId?: string
): Promise<SeoFactoryProjectStats> {
  const params: Record<string, string> = {};
  if (siteId) params.siteId = siteId;
  const res = await http.request<WmApiResponse<SeoFactoryProjectStats>>(
    "get",
    `${projectBase(projectId)}/stats/summary`,
    { params }
  );
  return res.data;
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

/** 重新拉取 SERP 并抓取竞品正文（不改大纲/初稿） */
export interface RefreshArticleJobSerpPayload {
  serpArticlesOnly?: boolean;
  serpArticleLimit?: number;
}

export async function refreshArticleJobSerp(
  projectId: string,
  jobId: string,
  payload?: RefreshArticleJobSerpPayload
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/refresh-serp`, {
    data: payload ?? {}
  });
  return res.data;
}

/** 已完成任务重新跑 SEO 优化轮次（202 异步） */
export async function rerunArticleOptimization(
  projectId: string,
  jobId: string,
  payload?: { reason?: "gsc_underperform" | "manual" }
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/rerun-optimization`, {
    data: payload ?? {}
  });
  return res.data;
}

/** 已完成任务仅重跑原创表达优化（202 异步） */
export async function rerunArticleParaphrase(
  projectId: string,
  jobId: string
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status" | "targetKeyword">>
  >("post", `${projectBase(projectId)}/${jobId}/rerun-paraphrase`);
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

export interface BatchActionResultItem {
  jobId: string;
  ok: boolean;
  error?: string;
}

export interface BatchRetryResult {
  retried: number;
  failed: number;
  results: BatchActionResultItem[];
}

export interface BatchPublishResult {
  published: number;
  failed: number;
  results: Array<BatchActionResultItem & { data?: CmsPublishResult }>;
}

/** 批量续跑失败任务 */
export async function batchRetryArticleJobs(
  projectId: string,
  jobIds: string[]
): Promise<BatchRetryResult> {
  const res = await http.request<WmApiResponse<BatchRetryResult>>(
    "post",
    `${projectBase(projectId)}/batch/retry`,
    { data: { jobIds } }
  );
  return res.data;
}

export interface BatchDeleteResult {
  deleted: number;
  failed: number;
  results: BatchActionResultItem[];
}

/** 删除单个文章任务（含队列与稿件插图） */
export async function deleteArticleJob(
  projectId: string,
  jobId: string
): Promise<{ id: string; targetKeyword: string; deleted: true }> {
  const res = await http.request<
    WmApiResponse<{ id: string; targetKeyword: string; deleted: true }>
  >("delete", `${projectBase(projectId)}/${jobId}`);
  return res.data;
}

/** 批量删除文章任务 */
export async function batchDeleteArticleJobs(
  projectId: string,
  jobIds: string[]
): Promise<BatchDeleteResult> {
  const res = await http.request<WmApiResponse<BatchDeleteResult>>(
    "post",
    `${projectBase(projectId)}/batch/delete`,
    { data: { jobIds } }
  );
  return res.data;
}

export interface BatchBriefApproveResult {
  approved: number;
  failed: number;
  results: BatchActionResultItem[];
}

/** 批量确认 Brief 并生成初稿 */
export async function batchApproveArticleBriefs(
  projectId: string,
  jobIds: string[]
): Promise<BatchBriefApproveResult> {
  const res = await http.request<WmApiResponse<BatchBriefApproveResult>>(
    "post",
    `${projectBase(projectId)}/batch/brief-approve`,
    { data: { jobIds } }
  );
  return res.data;
}

/** 批量推送到 WordPress */
export async function batchPublishArticleJobs(
  projectId: string,
  jobIds: string[],
  payload: { status?: "draft" | "publish" } = {}
): Promise<BatchPublishResult> {
  const res = await http.request<WmApiResponse<BatchPublishResult>>(
    "post",
    `${projectBase(projectId)}/batch/publish`,
    { data: { jobIds, ...payload } }
  );
  return res.data;
}

export interface BatchExportFailureItem {
  jobId: string;
  targetKeyword: string;
  error: string;
}

export interface BatchExportMeta {
  exported: number;
  failed: number;
  failures: BatchExportFailureItem[];
}

function parseBatchExportFailures(header: string | undefined): BatchExportFailureItem[] {
  if (!header) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(header)) as BatchExportFailureItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 批量下载导出资产包 zip（每个任务一个子目录） */
export async function batchExportArticleJobs(
  projectId: string,
  jobIds: string[]
): Promise<{ blob: Blob; meta: BatchExportMeta }> {
  let meta: BatchExportMeta = { exported: jobIds.length, failed: 0, failures: [] };
  const blob = await http.request<Blob>(
    "post",
    `${projectBase(projectId)}/batch/export`,
    { data: { jobIds }, responseType: "blob" },
    {
      beforeResponseCallback: (response) => {
        meta = {
          exported: Number(response.headers["x-export-exported"] ?? jobIds.length),
          failed: Number(response.headers["x-export-failed"] ?? 0),
          failures: parseBatchExportFailures(response.headers["x-export-failures"])
        };
      }
    }
  );
  return { blob, meta };
}

export interface PatchArticleBriefPayload {
  title?: string;
  searchIntent?: string;
  targetWordCount?: number;
  outline?: Array<{ heading: string; points?: string[] }>;
  contentGaps?: string[];
}

/** 编辑待确认 Brief */
export async function patchArticleBrief(
  projectId: string,
  jobId: string,
  payload: PatchArticleBriefPayload
): Promise<ArticleJobItem> {
  const res = await http.request<WmApiResponse<ArticleJobItem>>(
    "patch",
    `${projectBase(projectId)}/${jobId}/brief`,
    { data: payload }
  );
  return res.data;
}

/** 确认 Brief 并触发初稿 */
export async function approveArticleBrief(
  projectId: string,
  jobId: string
): Promise<ArticleJobItem> {
  const res = await http.request<WmApiResponse<ArticleJobItem>>(
    "post",
    `${projectBase(projectId)}/${jobId}/brief/approve`
  );
  return res.data;
}

/** 人工编辑内链锚文本与 URL */
export async function patchArticleInternalLinks(
  projectId: string,
  jobId: string,
  payload: { internalLinks: Array<{ anchorText: string; targetUrl: string }> }
) {
  const res = await http.request<
    WmApiResponse<{
      id: string;
      internalLinks: ArticleJobItem["draftData"] extends { internalLinks?: infer T } ? T : never;
      internalLinksApplied: boolean;
    }>
  >("patch", `${projectBase(projectId)}/${jobId}/internal-links`, { data: payload });
  return res.data;
}

/** 重跑自动内链植入 */
export async function reapplyArticleInternalLinks(projectId: string, jobId: string) {
  const res = await http.request<
    WmApiResponse<{
      id: string;
      internalLinksApplied: boolean;
    }>
  >("post", `${projectBase(projectId)}/${jobId}/internal-links/reapply`);
  return res.data;
}

/** 重新生成 Brief */
export async function regenerateArticleBrief(
  projectId: string,
  jobId: string
): Promise<Pick<ArticleJobItem, "id" | "traceId" | "status">> {
  const res = await http.request<
    WmApiResponse<Pick<ArticleJobItem, "id" | "traceId" | "status">>
  >("post", `${projectBase(projectId)}/${jobId}/brief/regenerate`);
  return res.data;
}
