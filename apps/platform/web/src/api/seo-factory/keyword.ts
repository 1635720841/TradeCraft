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
  createdAt: string;
  updatedAt: string;
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
  } = {}
): Promise<WmApiResponse<KeywordEntryItem[]>> {
  const params: Record<string, string | number | boolean> = { page, limit };
  if (filters.status) params.status = filters.status;
  if (filters.intent) params.intent = filters.intent;
  if (filters.clusterId) params.clusterId = filters.clusterId;
  if (filters.unclustered) params.unclustered = "1";
  if (filters.queueable) params.queueable = "1";
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
