/**
 * 稿件编辑：变更摘要、保存策略、发布清单项。
 */

import type {
  ArticleJobBriefData,
  ArticleJobDraftData,
  ArticleJobItem,
  ArticleJobYmylReview,
  DraftPostSaveAction,
  DraftStaleness,
  DraftStalenessAffected,
  ManualEditHistoryEntry,
  SiteContentProfile,
} from "@/api/seo-factory/types";
import {
  canPublishJobToCms,
  isCmsConfigured,
  resolveCmsPublishStatus,
} from "@/utils/seo-factory/cms-publish-status";
import {
  buildPrePublishChecklistItems,
  canContentScoreSubstituteSemrushStale,
  prePublishChecklistAllDone as sharedPrePublishAllDone,
  type ContentScoreSnapshot,
} from "@wm/shared-core";

export interface DraftEditPreviewFields {
  title?: string;
  metaDescription?: string;
  content?: string;
}

export function extractMarkdownH1(content: string): string {
  const match = content.replace(/\r\n/g, "\n").match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

/** 编辑/预览用：draftData 缺 title/meta 时回退 Brief 或正文 H1 */
export function resolveDraftTitleAndMeta(
  draft?: ArticleJobDraftData | null,
  brief?: ArticleJobBriefData | null
): { title: string; metaDescription: string } {
  const title =
    draft?.title?.trim() ||
    brief?.outline?.title?.trim() ||
    extractMarkdownH1(draft?.content ?? "") ||
    "";

  return {
    title,
    metaDescription: draft?.metaDescription?.trim() ?? ""
  };
}

export type PublishChecklistAction =
  | "refresh_local"
  | "rerun_semrush"
  | "regenerate_export"
  | "go_ymyl"
  | "go_edit"
  | "go_internal_links"
  | "go_images"
  | "publish_cms"
  | "go_sites";

export type PublishChecklistItemId =
  | keyof DraftStalenessAffected
  | "ymyl_review"
  | "title"
  | "meta"
  | "internal_links"
  | "images"
  | "export_ready"
  | "cta"
  | "cms_ready";

export interface PublishChecklistItem {
  id: PublishChecklistItemId;
  label: string;
  hint?: string;
  done: boolean;
  action?: PublishChecklistAction;
  loading?: boolean;
  disabled?: boolean;
}

export function previewPendingEditAffected(
  before: DraftEditPreviewFields,
  after: { title: string; metaDescription: string; content: string }
): DraftStalenessAffected | null {
  const titleChanged = (before.title ?? "") !== after.title;
  const metaChanged = (before.metaDescription ?? "") !== after.metaDescription;
  const contentChanged = (before.content ?? "").trim() !== after.content.trim();
  if (!titleChanged && !metaChanged && !contentChanged) return null;

  const titleMetaChanged = titleChanged || metaChanged;
  const beforeLen = (before.content ?? "").trim().length;
  const maxLen = Math.max(beforeLen, after.content.length, 1);
  const majorContent =
    contentChanged && Math.abs(after.content.length - beforeLen) / maxLen >= 0.1;

  return {
    localSeo: titleMetaChanged || contentChanged,
    semrush: contentChanged,
    paraphrase: contentChanged,
    ymyl: titleChanged || contentChanged,
    export: titleMetaChanged || contentChanged,
    internalLinks: majorContent,
    images: majorContent
  };
}

export function isContentMajorChange(
  before: DraftEditPreviewFields,
  after: { content: string }
): boolean {
  const beforeLen = (before.content ?? "").trim().length;
  const maxLen = Math.max(beforeLen, after.content.length, 1);
  if ((before.content ?? "").trim() === after.content.trim()) return false;
  return Math.abs(after.content.length - beforeLen) / maxLen >= 0.1;
}

/** 小改可跳过保存确认弹窗（Ctrl+S / 快速保存） */
export function needsSaveConfirmDialog(
  before: DraftEditPreviewFields,
  after: { title: string; metaDescription: string; content: string },
  options?: { ymylWasApproved?: boolean }
): boolean {
  const affected = previewPendingEditAffected(before, after);
  if (!affected) return false;
  if (options?.ymylWasApproved && affected.ymyl) return true;
  if (isContentMajorChange(before, after)) return true;
  return false;
}

export function resolveQuickSaveAction(
  affected: DraftStalenessAffected | null
): DraftPostSaveAction {
  return suggestPostSaveAction(affected);
}

export function suggestPostSaveAction(
  affected: DraftStalenessAffected | null
): DraftPostSaveAction {
  if (!affected) return "refresh_local";
  if (affected.semrush) return "rerun_from_optimizing";
  return "refresh_local";
}

export function suggestPostSaveReason(affected: DraftStalenessAffected | null): string {
  if (!affected) return "保存后将按推荐策略处理后续评分。";
  if (affected.semrush) {
    return "正文已变更，默认将重算本地 SEO 并重跑 Semrush 终检（约 2–5 分钟）。";
  }
  if (affected.export) {
    return "标题或 Meta 已变更，建议重算本地 SEO；导出物将失效，完成后请重新生成。";
  }
  return "建议保存并重算本地 SEO，以更新评分。";
}

export function isDraftFormDirty(
  before: DraftEditPreviewFields,
  after: { title: string; metaDescription: string; content: string }
): boolean {
  return previewPendingEditAffected(before, after) !== null;
}

export function countDraftWords(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function countActiveStaleItems(staleness: DraftStaleness | null | undefined): number {
  if (!staleness) return 0;
  return Object.values(staleness.affected).filter(Boolean).length;
}

export function formatHistoryChangeSummary(entry: ManualEditHistoryEntry): string {
  const parts: string[] = [];
  if (entry.changeSummary.titleChanged) parts.push("标题");
  if (entry.changeSummary.metaChanged) parts.push("Meta");
  const { charsBefore, charsAfter } = entry.changeSummary.contentDiffStats;
  if (charsBefore !== charsAfter) {
    parts.push(`正文 ${charsBefore}→${charsAfter} 字`);
  }
  return parts.length ? parts.join("、") : "无可见变更";
}

function ymylNeedsReview(review: ArticleJobYmylReview | null | undefined): boolean {
  if (!review?.requires_human_review) return false;
  return !review.humanReviewStatus || review.humanReviewStatus === "pending";
}

export function buildPublishChecklist(input: {
  staleness: DraftStaleness | null | undefined;
  localSeoScore?: number | null;
  outputUrl?: string | null;
  ymylReview?: ArticleJobYmylReview | null;
  semrushRunning?: boolean;
  resolvingAction?: string | null;
  contentScore?: ContentScoreSnapshot | null;
  draftContent?: string;
  reduceRpaEnabled?: boolean;
}): PublishChecklistItem[] {
  const affected = input.staleness?.affected;
  if (!affected) return [];

  const items: PublishChecklistItem[] = [];

  if (affected.localSeo) {
    items.push({
      id: "localSeo",
      label: "重算本地 SEO",
      hint:
        input.localSeoScore != null
          ? `当前 ${input.localSeoScore} 分（编辑前分数可能已过期）`
          : "编辑后需重新计算",
      done: false,
      action: "refresh_local",
      loading: input.resolvingAction === "refresh_local"
    });
  }

  if (affected.semrush) {
    const scoreCovers = canContentScoreSubstituteSemrushStale({
      snapshot: input.contentScore,
      currentContent: input.draftContent ?? "",
      reduceRpaEnabled: input.reduceRpaEnabled
    });
    if (!scoreCovers) {
      items.push({
        id: "semrush",
        label: "Semrush 终检",
        hint: input.semrushRunning ? "检测进行中…" : "约 2–5 分钟",
        done: false,
        action: "rerun_semrush",
        loading: input.resolvingAction === "rerun_semrush" || Boolean(input.semrushRunning),
        disabled: Boolean(input.semrushRunning)
      });
    } else {
      items.push({
        id: "semrush",
        label: "内容评分已达标",
        hint: `校准分 ${input.contentScore?.overall ?? "—"} / 10（高置信，可暂不跑 Semrush）`,
        done: true
      });
    }
  }

  if (affected.ymyl || ymylNeedsReview(input.ymylReview)) {
    const pending = ymylNeedsReview(input.ymylReview);
    items.push({
      id: "ymyl_review",
      label: pending ? "YMYL 人工审核" : "确认 YMYL 审查",
      hint: pending ? "编辑后需重新审核通过" : "请确认内容审查状态",
      done: !pending && !affected.ymyl,
      action: pending ? "go_ymyl" : undefined
    });
  }

  if (affected.export) {
    const ymylBlocked = ymylNeedsReview(input.ymylReview);
    items.push({
      id: "export",
      label: "重新生成导出",
      hint: ymylBlocked ? "需先完成 YMYL 审核" : "生成可下载 HTML / 资产包",
      done: false,
      action: "regenerate_export",
      loading: input.resolvingAction === "regenerate_export",
      disabled: ymylBlocked
    });
  }

  if (affected.internalLinks) {
    items.push({
      id: "internalLinks",
      label: "检查内链锚点",
      hint: "正文改动较大，请在「内链」Tab 核对",
      done: false
    });
  }

  if (affected.images) {
    items.push({
      id: "images",
      label: "检查配图占位",
      hint: "请在「配图」Tab 核对",
      done: false
    });
  }

  return items;
}

function draftContainsCta(content: string, profile?: SiteContentProfile | null): boolean {
  if (!profile?.ctaPrimaryUrl?.trim() && !profile?.ctaPrimaryText?.trim()) return true;
  const haystack = content.toLowerCase();
  const url = profile?.ctaPrimaryUrl?.trim().toLowerCase();
  const text = profile?.ctaPrimaryText?.trim().toLowerCase();
  if (url && haystack.includes(url.replace(/^https?:\/\//, ""))) return true;
  if (text && haystack.includes(text)) return true;
  return false;
}

/** 发布前检查清单（任务已完成、无编辑 stale 时） */
export function buildPrePublishChecklist(input: {
  job: ArticleJobItem;
  siteContentProfile?: SiteContentProfile | null;
  cmsUiEnabled?: boolean;
  exportStale?: boolean;
  resolvingAction?: string | null;
  publishingCms?: boolean;
}): PublishChecklistItem[] {
  if (input.job.status !== "COMPLETED") return [];
  if (input.job.draftData?.staleness) return [];

  const { title, metaDescription } = resolveDraftTitleAndMeta(
    input.job.draftData,
    input.job.briefData
  );
  const content = input.job.draftData?.content ?? "";
  const linkCount =
    input.job.internalLinkCount ?? input.job.draftData?.internalLinks?.length ?? 0;
  const ymylBlocked = ymylNeedsReview(input.job.seoCheckData?.ymylReview ?? null);
  const cmsStatus = resolveCmsPublishStatus(input.job);
  const cmsConfigured = isCmsConfigured(input.job);
  const ctaRequired = Boolean(
    input.siteContentProfile?.ctaPrimaryUrl?.trim() ||
      input.siteContentProfile?.ctaPrimaryText?.trim()
  );

  const sharedItems = buildPrePublishChecklistItems({
    status: input.job.status,
    hasStaleness: Boolean(input.job.draftData?.staleness),
    title,
    metaDescription,
    content,
    internalLinksApplied: input.job.draftData?.internalLinksApplied,
    internalLinkCount: linkCount,
    imagesApplied: input.job.draftData?.imagesApplied,
    outputUrl: input.job.outputUrl,
    exportStale: input.exportStale,
    ymylNeedsReview: ymylBlocked,
    ctaRequired,
    ctaPresent: draftContainsCta(content, input.siteContentProfile),
    cmsConfigured,
    cmsUiEnabled: Boolean(input.cmsUiEnabled),
    cmsPublished: cmsStatus === "published" || cmsStatus === "draft",
    canPublishCms: canPublishJobToCms(input.job),
    cmsBlocked: !input.job.outputUrl || ymylBlocked || Boolean(input.exportStale),
    resolvingAction: input.resolvingAction,
    publishingCms: input.publishingCms
  });

  return sharedItems as PublishChecklistItem[];
}

export function prePublishChecklistAllDone(items: PublishChecklistItem[]): boolean {
  return sharedPrePublishAllDone(items);
}

export function draftEditStatusLabel(job: Pick<ArticleJobItem, "draftData">): string | null {
  const count = countActiveStaleItems(job.draftData?.staleness);
  if (count <= 0) return null;
  return `稿件已编辑，${count} 项待处理`;
}
