/**
 * Prompt 模板 API。
 */

import { http } from "@/utils/http";
import type { WmApiResponse, WmPaginationMeta } from "./types";

export interface PromptTemplateItem {
  id: string;
  version: string;
  name: string;
  description?: string | null;
  content?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateListResult {
  items: PromptTemplateItem[];
  pagination: WmPaginationMeta;
}

export interface CreatePromptTemplatePayload {
  version: string;
  name: string;
  description?: string;
  content: string;
  isActive?: boolean;
}

export interface UpdatePromptTemplatePayload {
  name?: string;
  description?: string;
  content?: string;
  isActive?: boolean;
}

export async function listPromptTemplates(
  page = 1,
  limit = 20
): Promise<PromptTemplateListResult> {
  const res = await http.request<WmApiResponse<PromptTemplateItem[]>>(
    "get",
    "/api/v1/platform/prompts",
    { params: { page, limit } }
  );
  const pagination = res.meta?.pagination ?? {
    page,
    limit,
    total: res.data?.length ?? 0
  };
  return { items: res.data ?? [], pagination };
}

export async function getPromptTemplate(version: string): Promise<PromptTemplateItem> {
  const res = await http.request<WmApiResponse<PromptTemplateItem>>(
    "get",
    `/api/v1/platform/prompts/${encodeURIComponent(version)}`
  );
  return res.data;
}

export async function createPromptTemplate(
  payload: CreatePromptTemplatePayload
): Promise<PromptTemplateItem> {
  const res = await http.request<WmApiResponse<PromptTemplateItem>>(
    "post",
    "/api/v1/platform/prompts",
    { data: payload }
  );
  return res.data;
}

export async function updatePromptTemplate(
  version: string,
  payload: UpdatePromptTemplatePayload
): Promise<PromptTemplateItem> {
  const res = await http.request<WmApiResponse<PromptTemplateItem>>(
    "patch",
    `/api/v1/platform/prompts/${encodeURIComponent(version)}`,
    { data: payload }
  );
  return res.data;
}

export async function clearPromptTemplateCache(
  version: string
): Promise<{ version: string; cleared: boolean }> {
  const res = await http.request<WmApiResponse<{ version: string; cleared: boolean }>>(
    "post",
    `/api/v1/platform/prompts/${encodeURIComponent(version)}/cache/clear`
  );
  return res.data;
}
