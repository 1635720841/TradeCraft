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
  RewriteArticleJobPayload,
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
