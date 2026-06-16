/**
 * WordPress / Shopify CMS 发布状态展示文案。
 */
import type { ArticleJobItem } from "@/api/seo-factory/types";

export type CmsPublishDisplayStatus =
  | "not_configured"
  | "not_ready"
  | "pending"
  | "draft"
  | "published"
  | "failed";

const CMS_TYPES = new Set(["wordpress", "shopify"]);

function getShopifyPublishTarget(job?: ArticleJobItem): "blog" | "product" | null {
  if (job?.siteShopifyPublishTarget === "product") return "product";
  const cms = job?.seoCheckData?.cmsPublish;
  if (cms?.provider === "shopify" && cms.publishTarget === "product") return "product";
  if (job?.siteCmsType === "shopify") return "blog";
  return null;
}

export function isCmsConfigured(job: ArticleJobItem): boolean {
  return CMS_TYPES.has(job.siteCmsType ?? "");
}

export function resolveCmsPublishStatus(job: ArticleJobItem): CmsPublishDisplayStatus {
  if (!isCmsConfigured(job)) return "not_configured";
  if (job.status !== "COMPLETED" || !job.outputUrl) return "not_ready";

  const cms = job.seoCheckData?.cmsPublish;
  if (cms?.lastError && !cms.postUrl) return "failed";
  if (!cms?.postUrl) return "pending";
  if (cms.status === "publish" || cms.status === "published") return "published";
  return "draft";
}

export function cmsPublishStatusLabel(status: CmsPublishDisplayStatus, job?: ArticleJobItem): string {
  if (status === "not_configured") return "未配置 CMS";
  if (status === "not_ready") return "未就绪";
  if (status === "pending") return "待推送";
  if (status === "draft") {
    if (job?.siteCmsType === "shopify") {
      return getShopifyPublishTarget(job) === "product" ? "Shopify 产品草稿" : "Shopify 草稿";
    }
    return "WP 草稿";
  }
  if (status === "published") {
    if (getShopifyPublishTarget(job) === "product") return "产品页已更新";
    return "已发布";
  }
  return "推送失败";
}

export function cmsPublishStatusTagType(
  status: CmsPublishDisplayStatus
): "info" | "success" | "warning" | "danger" {
  if (status === "published" || status === "draft") return "success";
  if (status === "pending") return "warning";
  if (status === "failed") return "danger";
  return "info";
}

export function canPublishJobToCms(job: ArticleJobItem): boolean {
  const status = resolveCmsPublishStatus(job);
  return status === "pending" || status === "failed" || status === "draft" || status === "published";
}

function isShopifyProductTarget(job: ArticleJobItem): boolean {
  return getShopifyPublishTarget(job) === "product";
}

export function cmsPublishActionLabel(job: ArticleJobItem): string {
  const status = resolveCmsPublishStatus(job);
  const shopifyProduct = isShopifyProductTarget(job);

  if (status === "draft" || status === "published") {
    if (shopifyProduct) return "更新产品页描述";
    if (job.siteCmsType === "shopify") return "更新 Shopify 内容";
    if (job.siteCmsType === "wordpress") return "更新 WordPress 内容";
    return "更新 CMS 内容";
  }
  if (shopifyProduct) return "推送到产品页";
  if (job.siteCmsType === "shopify") return "推送到 Shopify";
  if (job.siteCmsType === "wordpress") return "推送到 WordPress";
  return "推送到 CMS";
}
