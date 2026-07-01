/**
 * M7 结果展示：与 seoCheckData.quillbot 对齐。
 */

import type { ArticleJobQuillbotResult } from "@/api/seo-factory/types";
import {
  PARAPHRASE_BADGE_CHECKED,
  PARAPHRASE_BADGE_POLISHED,
  PARAPHRASE_FEATURE_SHORT,
  PARAPHRASE_SKIPPED_DEFAULT,
  PARAPHRASE_STATUS_DONE,
  PARAPHRASE_STATUS_KEPT_ORIGINAL,
  PARAPHRASE_STATUS_PENDING,
  PARAPHRASE_STATUS_SKIPPED,
  PARAPHRASE_STATUS_UNNEEDED
} from "@wm/shared-core";

export type ParaphraseOutcomeTone = "pass" | "info" | "warn";

export interface ParaphraseOutcomeDisplay {
  label: string;
  tone: ParaphraseOutcomeTone;
  badgeLabel?: string;
}

/** 从 quillbot 元数据解析运营向状态标签 */
export function resolveParaphraseOutcomeDisplay(
  quillbot?: ArticleJobQuillbotResult | null,
  paraphraseApplied?: boolean
): ParaphraseOutcomeDisplay {
  if (!paraphraseApplied && !quillbot?.completedAt && !quillbot?.skipped) {
    return { label: PARAPHRASE_STATUS_PENDING, tone: "info" };
  }
  if (quillbot?.skipped) {
    return { label: PARAPHRASE_STATUS_SKIPPED, tone: "info" };
  }
  if (quillbot?.polishUnneeded) {
    return { label: PARAPHRASE_STATUS_UNNEEDED, tone: "pass", badgeLabel: PARAPHRASE_BADGE_CHECKED };
  }
  if (quillbot?.usedOriginal) {
    return { label: PARAPHRASE_STATUS_KEPT_ORIGINAL, tone: "warn" };
  }
  if (quillbot?.passed || quillbot?.completedAt) {
    return { label: PARAPHRASE_STATUS_DONE, tone: "pass", badgeLabel: PARAPHRASE_BADGE_POLISHED };
  }
  return { label: PARAPHRASE_STATUS_PENDING, tone: "info" };
}

export { PARAPHRASE_FEATURE_SHORT };
