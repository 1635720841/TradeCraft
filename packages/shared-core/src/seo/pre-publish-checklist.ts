/**
 * 发布前检查清单（纯函数，供 Web 与单元测试复用）。
 */

export interface PrePublishChecklistInput {
  status: string;
  hasStaleness: boolean;
  title: string;
  metaDescription: string;
  content: string;
  internalLinksApplied?: boolean;
  internalLinkCount: number;
  imagesApplied?: boolean;
  outputUrl?: string | null;
  exportStale?: boolean;
  ymylNeedsReview: boolean;
  ctaRequired: boolean;
  ctaPresent: boolean;
  cmsConfigured: boolean;
  cmsUiEnabled: boolean;
  cmsPublished: boolean;
  canPublishCms: boolean;
  cmsBlocked: boolean;
  seoReleaseReady?: boolean;
  seoReadyHint?: string;
  resolvingAction?: string | null;
  publishingCms?: boolean;
}

export type PrePublishChecklistAction =
  | "regenerate_export"
  | "go_ymyl"
  | "go_edit"
  | "go_internal_links"
  | "go_images"
  | "go_seo"
  | "publish_cms";

export interface PrePublishChecklistItem {
  id: string;
  label: string;
  hint?: string;
  done: boolean;
  action?: PrePublishChecklistAction;
  loading?: boolean;
  disabled?: boolean;
}

export function buildPrePublishChecklistItems(
  input: PrePublishChecklistInput,
): PrePublishChecklistItem[] {
  if (input.status !== "COMPLETED" || input.hasStaleness) return [];

  const items: PrePublishChecklistItem[] = [
    {
      id: "title",
      label: "标题长度",
      hint: input.title ? `${input.title.length} 字` : "缺少标题",
      done: Boolean(input.title) && input.title.length <= 60,
      action: "go_edit",
    },
    {
      id: "meta",
      label: "Meta 描述",
      hint: input.metaDescription
        ? `${input.metaDescription.length} 字`
        : "建议填写 150–160 字 Meta",
      done: Boolean(input.metaDescription) && input.metaDescription.length <= 160,
      action: "go_edit",
    },
    {
      id: "internal_links",
      label: "内链",
      hint: `已植入 ${input.internalLinkCount} 条（建议 ≥2）`,
      done: Boolean(input.internalLinksApplied) && input.internalLinkCount >= 2,
      action: "go_internal_links",
    },
    {
      id: "images",
      label: "配图",
      hint: input.imagesApplied ? "已植入配图" : "建议完成配图与 alt",
      done: Boolean(input.imagesApplied),
      action: "go_images",
    },
    {
      id: "ymyl_review",
      label: "YMYL 审查",
      hint: input.ymylNeedsReview ? "需人工审核通过" : "已通过",
      done: !input.ymylNeedsReview,
      action: input.ymylNeedsReview ? "go_ymyl" : undefined,
    },
    {
      id: "seo_ready",
      label: "SEO 达标",
      hint: input.seoReadyHint ?? (input.seoReleaseReady ? "本地与 Semrush 均已达标" : "分数未达标，建议先优化"),
      done: input.seoReleaseReady === true,
      action: input.seoReleaseReady ? undefined : "go_seo",
    },
    {
      id: "export_ready",
      label: "导出物",
      hint: input.exportStale
        ? "稿件已编辑，需重新生成"
        : input.outputUrl
          ? "可下载 HTML / 资产包"
          : "尚未生成导出",
      done: Boolean(input.outputUrl) && !input.exportStale,
      action: "regenerate_export",
      loading: input.resolvingAction === "regenerate_export",
      disabled: input.ymylNeedsReview,
    },
  ];

  if (input.ctaRequired) {
    items.push({
      id: "cta",
      label: "文末询盘引导",
      hint: "正文应包含站点配置的 CTA 文案或链接",
      done: input.ctaPresent,
      action: "go_edit",
    });
  }

  if (input.cmsUiEnabled && input.cmsConfigured) {
    items.push({
      id: "cms_ready",
      label: "CMS 推送",
      hint: input.cmsPublished ? "已推送，可更新内容" : "完成后可推送到 CMS",
      done: input.cmsPublished,
      action: input.canPublishCms ? "publish_cms" : undefined,
      loading: Boolean(input.publishingCms),
      disabled: input.cmsBlocked || input.seoReleaseReady === false,
    });
  }

  return items;
}

export function prePublishChecklistAllDone(items: PrePublishChecklistItem[]): boolean {
  return items.length > 0 && items.every((item) => item.done);
}
