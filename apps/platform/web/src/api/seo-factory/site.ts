/**
 * seo-factory 站点与页面库 API。
 */

import { http } from "@/utils/http";
import type {
  DiscoveredSeoArticle,
  SiteItem,
  SitePageItem,
  SitePageSyncResult,
  WmApiResponse
} from "./types";

/** 项目下站点列表 */
export async function listSites(projectId: string): Promise<SiteItem[]> {
  const res = await http.request<WmApiResponse<SiteItem[]>>(
    "get",
    `/api/v1/projects/${projectId}/sites`
  );
  return res.data ?? [];
}

/** 预览站点采集到的 SEO 文章（sitemap） */
export async function listSiteSeoArticles(
  projectId: string,
  siteId: string,
  limit = 20,
  seoArticlesOnly = true
): Promise<DiscoveredSeoArticle[]> {
  const res = await http.request<WmApiResponse<DiscoveredSeoArticle[]>>(
    "get",
    `/api/v1/projects/${projectId}/sites/${siteId}/seo-articles`,
    { params: { limit, seoArticlesOnly } }
  );
  return res.data ?? [];
}

/** 站点页面库列表（内链候选） */
export async function listSitePages(
  projectId: string,
  siteId: string
): Promise<SitePageItem[]> {
  const res = await http.request<WmApiResponse<SitePageItem[]>>(
    "get",
    `/api/v1/projects/${projectId}/sites/${siteId}/pages`
  );
  return res.data ?? [];
}

/** 从 sitemap 同步站点页面库 */
export async function syncSitePages(
  projectId: string,
  siteId: string
): Promise<SitePageSyncResult> {
  const res = await http.request<WmApiResponse<SitePageSyncResult>>(
    "post",
    `/api/v1/projects/${projectId}/sites/${siteId}/pages/sync`
  );
  return res.data ?? { discovered: 0, upserted: 0 };
}
