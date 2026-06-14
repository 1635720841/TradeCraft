/**
 * Prompt 用途展示元数据（运营向）。
 */

import type { PromptRuntimeSlot, PromptRuntimeSlotId } from "@/api/platform/prompt";

export type PromptUsageCategory = "active" | "legacy" | "unused";

export interface PromptUsageMeta {
  category: PromptUsageCategory;
  label: string;
  hint?: string;
}

/** 前端展示用：已知历史版本 */
export const PROMPT_LEGACY_HINTS: Record<string, string> = {
  seo_optimize_v1: "旧版本地优化，已被新版本替代",
  seo_optimize_v2: "旧版 B2B 优化，已被新版本替代"
};

export function resolvePromptUsage(
  version: string,
  runtimeSlots: PromptRuntimeSlot[] = []
): PromptUsageMeta {
  const slot = runtimeSlots.find(item => item.activeVersion === version);
  if (slot) {
    return { category: "active", label: slot.label };
  }
  const legacyHint = PROMPT_LEGACY_HINTS[version];
  if (legacyHint) {
    return { category: "legacy", label: "历史版本", hint: legacyHint };
  }
  return {
    category: "unused",
    label: "未接入",
    hint: "可在「当前线上配置」中绑定到某个功能"
  };
}

export function usageTagType(category: PromptUsageCategory) {
  if (category === "active") return "success" as const;
  if (category === "legacy") return "info" as const;
  return "warning" as const;
}

export function usageTagLabel(category: PromptUsageCategory) {
  if (category === "active") return "线上使用中";
  if (category === "legacy") return "历史归档";
  return "未接入";
}

/** 该版本是否绑定到某个线上功能槽位 */
export function findBoundSlot(
  version: string,
  runtimeSlots: PromptRuntimeSlot[]
): PromptRuntimeSlot | undefined {
  return runtimeSlots.find(slot => slot.activeVersion === version);
}

export function canDeletePromptVersion(
  version: string,
  runtimeSlots: PromptRuntimeSlot[]
): { allowed: boolean; reason?: string } {
  const slot = findBoundSlot(version, runtimeSlots);
  if (slot) {
    return {
      allowed: false,
      reason: `「${slot.label}」正在使用此版本，请先在上方切换到其他版本`
    };
  }
  return { allowed: true };
}

/** 某功能槽位可选的 Prompt 版本（启用中 + 前缀匹配） */
export function versionsForSlot(
  slot: PromptRuntimeSlot,
  templates: Array<{ version: string; name: string; isActive: boolean }>
) {
  const active = templates.filter(item => item.isActive);
  if (slot.id === "localOptimize") {
    return active.filter(
      item =>
        item.version.startsWith("seo_optimize_") &&
        !item.version.startsWith("seo_optimize_semrush_")
    );
  }
  return active.filter(item => item.version.startsWith(slot.versionPrefix));
}

export type { PromptRuntimeSlotId };
