/**
 * seo-factory 站点与页面库 API。
 */

import { http } from "@/utils/http";
import { seoFactoryApiPath } from "./paths";
import type {
  DiscoveredSeoArticle,
  SiteItem,
  SitePageItem,
  SitePageSyncResult,
  CreateSitePayload,
  UpdateSitePayload,
  ShopifyBlogItem,
  ShopifyProductItem,
  WmApiResponse
} from "./types";

/** 项目下站点列表 */
export async function listSites(projectId: string): Promise<SiteItem[]> {
  const res = await http.request<WmApiResponse<SiteItem[]>>(
    "get",
    seoFactoryApiPath(projectId, "sites")
  );
  return res.data ?? [];
}

/** 创建站点 */
export async function createSite(
  projectId: string,
  payload: CreateSitePayload
): Promise<SiteItem> {
  const res = await http.request<WmApiResponse<SiteItem>>(
    "post",
    seoFactoryApiPath(projectId, "sites"),
    { data: payload }
  );
  return res.data;
}

/** 更新站点 */
export async function updateSite(
  projectId: string,
  siteId: string,
  payload: UpdateSitePayload
): Promise<SiteItem> {
  const res = await http.request<WmApiResponse<SiteItem>>(
    "patch",
    seoFactoryApiPath(projectId, `sites/${siteId}`),
    { data: payload }
  );
  return res.data;
}

/** 清除本项目下 Google 搜索缓存（管理员） */
export async function clearSiteSerpCache(
  projectId: string,
  siteId: string
): Promise<{ deleted: number }> {
  const res = await http.request<WmApiResponse<{ deleted: number }>>(
    "post",
    seoFactoryApiPath(projectId, `sites/${siteId}/serp-cache/clear`)
  );
  return res.data ?? { deleted: 0 };
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
    seoFactoryApiPath(projectId, `sites/${siteId}/seo-articles`),
    { params: { limit, seoArticlesOnly } }
  );
  return res.data ?? [];
}

/** 从 Shopify Admin API 拉取 Blog 列表（新建/编辑站点表单用） */
export async function listShopifyBlogs(
  projectId: string,
  payload: {
    siteId?: string;
    shopDomain?: string;
    accessToken?: string;
  }
): Promise<ShopifyBlogItem[]> {
  const res = await http.request<WmApiResponse<ShopifyBlogItem[]>>(
    "post",
    seoFactoryApiPath(projectId, "sites/shopify/blogs"),
    { data: payload }
  );
  return res.data ?? [];
}

/** 从 Shopify Admin API 拉取 Product 列表（产品详情页推送用） */
export async function listShopifyProducts(
  projectId: string,
  payload: {
    siteId?: string;
    shopDomain?: string;
    accessToken?: string;
  }
): Promise<ShopifyProductItem[]> {
  const res = await http.request<WmApiResponse<ShopifyProductItem[]>>(
    "post",
    seoFactoryApiPath(projectId, "sites/shopify/products"),
    { data: payload }
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
    seoFactoryApiPath(projectId, `sites/${siteId}/pages`)
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
    seoFactoryApiPath(projectId, `sites/${siteId}/pages/sync`)
  );
  return res.data ?? { discovered: 0, upserted: 0 };
}

export async function patchSitePage(
  projectId: string,
  siteId: string,
  pageId: string,
  payload: { primaryKeyword?: string | null }
): Promise<SitePageItem> {
  const res = await http.request<WmApiResponse<SitePageItem>>(
    "patch",
    seoFactoryApiPath(projectId, `sites/${siteId}/pages/${pageId}`),
    { data: payload }
  );
  return res.data;
}
