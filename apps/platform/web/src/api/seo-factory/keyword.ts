/**
 * seo-factory 关键词池 API。
 */

import { http } from "@/utils/http";
import { seoFactoryApiPath } from "./paths";
import type { ArticleJobItem, KeywordCannibalizationWarning, WmApiResponse } from "./types";

export interface KeywordEntryItem {
  id: string;
  keyword: string;
  siteId?: string | null;
  clusterId?: string | null;
  cluster?: { id: string; name: string } | null;
  intent: string;
  status: string;
  source: string;
  searchVolume?: number | null;
  keywordDifficulty?: number | null;
  cpc?: number | null;
  businessValueScore: number;
  contentFitScore: number;
  priorityScore: number;
  notes?: string | null;
  lastJobId?: string | null;
  gscInsight?: GscKeywordInsight | null;
  createdAt: string;
  updatedAt: string;
}

export interface GscKeywordInsight {
  status: "traffic" | "impressions" | "underperform" | "none";
  impressions: number;
  clicks: number;
  position: number;
  periodDays: number;
  syncedAt: string;
}

export interface GscDiscoveredQuery {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  siteId: string;
  siteDomain: string;
}

export interface CreateKeywordPayload {
  keyword: string;
  siteId?: string;
  clusterId?: string;
  clusterName?: string;
  intent?: string;
  searchVolume?: number;
  keywordDifficulty?: number;
  cpc?: number;
  businessValueScore?: number;
  contentFitScore?: number;
  notes?: string;
}

export interface UpdateKeywordPayload {
  siteId?: string | null;
  clusterId?: string | null;
  clusterName?: string;
  intent?: string;
  status?: string;
  searchVolume?: number | null;
  keywordDifficulty?: number | null;
  cpc?: number | null;
  businessValueScore?: number;
  contentFitScore?: number;
  notes?: string | null;
}

export interface ImportKeywordsResult {
  created: number;
  skipped: number;
  items: KeywordEntryItem[];
}

function projectBase(projectId: string) {
  return seoFactoryApiPath(projectId, "keywords");
}

export interface KeywordSummary {
  queueableCount: number;
  unclusteredCount: number;
  archivedCount: number;
  clusterCount: number;
  highPriorityQueueableCount: number;
}

export async function getKeywordSummary(projectId: string): Promise<KeywordSummary> {
  const res = await http.request<WmApiResponse<KeywordSummary>>(
    "get",
    `${projectBase(projectId)}/summary`
  );
  return res.data;
}

export async function listKeywords(
  projectId: string,
  page = 1,
  limit = 20,
  filters: {
    status?: string;
    intent?: string;
    clusterId?: string;
    unclustered?: boolean;
    queueable?: boolean;
    excludeArchived?: boolean;
    gscVerified?: boolean;
  } = {}
): Promise<WmApiResponse<KeywordEntryItem[]>> {
  const params: Record<string, string | number | boolean> = { page, limit };
  if (filters.status) params.status = filters.status;
  if (filters.intent) params.intent = filters.intent;
  if (filters.clusterId) params.clusterId = filters.clusterId;
  if (filters.unclustered) params.unclustered = "1";
  if (filters.queueable) params.queueable = "1";
  if (filters.excludeArchived === false) params.excludeArchived = "0";
  if (filters.gscVerified) params.gscVerified = "1";
  return http.request<WmApiResponse<KeywordEntryItem[]>>("get", projectBase(projectId), {
    params
  });
}

export async function createKeyword(
  projectId: string,
  payload: CreateKeywordPayload
): Promise<KeywordEntryItem> {
  const res = await http.request<WmApiResponse<KeywordEntryItem>>(
    "post",
    projectBase(projectId),
    { data: payload }
  );
  return res.data;
}

export async function importKeywords(
  projectId: string,
  items: CreateKeywordPayload[]
): Promise<ImportKeywordsResult> {
  const res = await http.request<WmApiResponse<ImportKeywordsResult>>(
    "post",
    `${projectBase(projectId)}/import`,
    { data: { items } }
  );
  return res.data;
}

export async function updateKeyword(
  projectId: string,
  keywordId: string,
  payload: UpdateKeywordPayload
): Promise<KeywordEntryItem> {
  const res = await http.request<WmApiResponse<KeywordEntryItem>>(
    "patch",
    `${projectBase(projectId)}/${keywordId}`,
    { data: payload }
  );
  return res.data;
}

export async function deleteKeyword(
  projectId: string,
  keywordId: string
): Promise<{ id: string; keyword: string; deleted: true }> {
  const res = await http.request<
    WmApiResponse<{ id: string; keyword: string; deleted: true }>
  >("delete", `${projectBase(projectId)}/${keywordId}`);
  return res.data;
}

export interface DeleteKeywordsPayload {
  ids: string[];
}

export interface DeleteKeywordsResult {
  deleted: number;
}

export async function deleteKeywords(
  projectId: string,
  payload: DeleteKeywordsPayload
): Promise<DeleteKeywordsResult> {
  const res = await http.request<WmApiResponse<DeleteKeywordsResult>>(
    "post",
    `${projectBase(projectId)}/batch/delete`,
    { data: payload }
  );
  return res.data;
}

export async function createJobFromKeyword(
  projectId: string,
  keywordId: string,
  siteId?: string
): Promise<{ job: ArticleJobItem; keywordId: string; warnings?: KeywordCannibalizationWarning[] }> {
  const res = await http.request<
    WmApiResponse<{ job: ArticleJobItem; keywordId: string; warnings?: KeywordCannibalizationWarning[] }>
  >(
    "post",
    `${projectBase(projectId)}/${keywordId}/create-job`,
    { data: siteId ? { siteId } : {} }
  );
  return res.data;
}

export interface CreateJobsFromKeywordsPayload {
  ids: string[];
  siteId?: string;
}

export interface CreateJobsFromKeywordsResult {
  created: number;
  skipped: number;
  jobs: Array<{ job: ArticleJobItem; keywordId: string }>;
}

/** 从关键词池批量创建并入队 ArticleJob（202） */
export async function createJobsFromKeywords(
  projectId: string,
  payload: CreateJobsFromKeywordsPayload
): Promise<CreateJobsFromKeywordsResult> {
  const res = await http.request<WmApiResponse<CreateJobsFromKeywordsResult>>(
    "post",
    `${projectBase(projectId)}/create-jobs`,
    { data: payload }
  );
  return res.data;
}

export interface KeywordSeedCandidate {
  keyword: string;
  intent: string;
  businessValueScore: number;
  contentFitScore: number;
  rationale?: string;
  alreadyExists?: boolean;
}

export interface PreviewKeywordSeedsPayload {
  siteId?: string;
  count?: number;
  topicHint?: string;
}

export interface PreviewKeywordSeedsResult {
  siteId: string;
  keywords: KeywordSeedCandidate[];
  promptVersion: string;
}

export interface ConfirmKeywordSeedsPayload {
  siteId?: string;
  keywords: Array<{
    keyword: string;
    intent: string;
    businessValueScore: number;
    contentFitScore: number;
    rationale?: string;
  }>;
}

export interface ConfirmKeywordSeedsResult {
  created: number;
  skipped: number;
  items: KeywordEntryItem[];
}

export async function previewKeywordSeeds(
  projectId: string,
  payload: PreviewKeywordSeedsPayload = {}
): Promise<PreviewKeywordSeedsResult> {
  const res = await http.request<WmApiResponse<PreviewKeywordSeedsResult>>(
    "post",
    `${projectBase(projectId)}/generate-seeds/preview`,
    { data: payload }
  );
  return res.data;
}

export async function confirmKeywordSeeds(
  projectId: string,
  payload: ConfirmKeywordSeedsPayload
): Promise<ConfirmKeywordSeedsResult> {
  const res = await http.request<WmApiResponse<ConfirmKeywordSeedsResult>>(
    "post",
    `${projectBase(projectId)}/generate-seeds/confirm`,
    { data: payload }
  );
  return res.data;
}

/** @deprecated 使用 previewKeywordSeeds + confirmKeywordSeeds */
export interface GenerateKeywordSeedsPayload {
  siteId?: string;
  count?: number;
  topicHint?: string;
}

export interface GenerateKeywordSeedsResult {
  created: number;
  skipped: number;
  items: KeywordEntryItem[];
  promptVersion: string;
}

export async function generateKeywordSeeds(
  projectId: string,
  payload: GenerateKeywordSeedsPayload = {}
): Promise<GenerateKeywordSeedsResult> {
  const res = await http.request<WmApiResponse<GenerateKeywordSeedsResult>>(
    "post",
    `${projectBase(projectId)}/generate-seeds`,
    { data: payload }
  );
  return res.data;
}

export interface EnrichKeywordMetricsPayload {
  ids?: string[];
  allMissing?: boolean;
}

export interface EnrichKeywordMetricsResult {
  updated: number;
  items: KeywordEntryItem[];
}

export async function enrichKeywordMetrics(
  projectId: string,
  payload: EnrichKeywordMetricsPayload = { allMissing: true }
): Promise<EnrichKeywordMetricsResult> {
  const res = await http.request<WmApiResponse<EnrichKeywordMetricsResult>>(
    "post",
    `${projectBase(projectId)}/enrich-metrics`,
    { data: payload }
  );
  return res.data;
}

export async function listGscDiscoveredQueries(
  projectId: string
): Promise<GscDiscoveredQuery[]> {
  const res = await http.request<WmApiResponse<GscDiscoveredQuery[]>>(
    "get",
    `${projectBase(projectId)}/gsc-discovered`
  );
  return res.data ?? [];
}

export interface ImportGscKeywordsPayload {
  items: Array<{ query: string; siteId?: string }>;
}

export interface ImportGscKeywordsResult {
  created: number;
  skipped: number;
  items: KeywordEntryItem[];
}

export async function importGscKeywords(
  projectId: string,
  payload: ImportGscKeywordsPayload
): Promise<ImportGscKeywordsResult> {
  const res = await http.request<WmApiResponse<ImportGscKeywordsResult>>(
    "post",
    `${projectBase(projectId)}/import-from-gsc`,
    { data: payload }
  );
  return res.data;
}
