/** 关键词选题中心：面向用户的优先级与状态展示 */

export type KeywordPriorityTier = "high" | "medium" | "low";

export type KeywordDisplayStatusType = "success" | "warning" | "primary" | "info";

export interface KeywordDisplayStatus {
  label: string;
  type: KeywordDisplayStatusType;
}

const PRIORITY_TIER_LABEL: Record<KeywordPriorityTier, string> = {
  high: "高",
  medium: "中",
  low: "低"
};

const PRIORITY_TIER_TAG: Record<KeywordPriorityTier, KeywordDisplayStatusType> = {
  high: "success",
  medium: "warning",
  low: "info"
};

/** 优先级分数 → 高/中/低（与后端 KEYWORD_HIGH_PRIORITY_THRESHOLD 一致） */
export const KEYWORD_HIGH_PRIORITY_THRESHOLD = 75;

export function getKeywordPriorityTier(score: number): KeywordPriorityTier {
  if (score >= KEYWORD_HIGH_PRIORITY_THRESHOLD) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function getKeywordPriorityTierLabel(tier: KeywordPriorityTier): string {
  return PRIORITY_TIER_LABEL[tier];
}

export function getKeywordPriorityTierTagType(
  tier: KeywordPriorityTier
): KeywordDisplayStatusType {
  return PRIORITY_TIER_TAG[tier];
}

export function getKeywordPriorityTierHint(tier: KeywordPriorityTier): string {
  if (tier === "high") return "搜索价值与匹配度较高，建议优先排产";
  if (tier === "medium") return "可作为常规排产候选";
  return "价值或匹配度偏低，可延后或再评估";
}

/** 后端状态 → 用户可见文案（待写 / 已排产 / 已归档） */
export function getKeywordDisplayStatus(status: string): KeywordDisplayStatus {
  if (status === "USED") return { label: "已排产", type: "primary" };
  if (status === "ARCHIVED") return { label: "已归档", type: "info" };
  return { label: "待写", type: "warning" };
}

export function isKeywordQueueable(status: string): boolean {
  return status !== "ARCHIVED" && status !== "USED";
}

export function isKeywordPendingWrite(status: string): boolean {
  return status === "PENDING" || status === "APPROVED";
}

/** 下一批建议数量 */
export const KEYWORD_NEXT_BATCH_SIZE = 5;
