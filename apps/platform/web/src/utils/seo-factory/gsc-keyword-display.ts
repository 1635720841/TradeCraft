/** 词库 GSC 搜索验证展示 */

import type { KeywordDisplayStatusType } from "./keyword-display";

export type GscKeywordInsightStatus = "traffic" | "impressions" | "underperform" | "none";

export interface GscKeywordInsight {
  status: GscKeywordInsightStatus;
  impressions: number;
  clicks: number;
  position: number;
  periodDays: number;
  syncedAt: string;
}

const GSC_INSIGHT_LABEL: Record<Exclude<GscKeywordInsightStatus, "none">, string> = {
  traffic: "有流量",
  impressions: "有曝光",
  underperform: "需优化"
};

const GSC_INSIGHT_TAG: Record<Exclude<GscKeywordInsightStatus, "none">, KeywordDisplayStatusType> = {
  traffic: "success",
  impressions: "warning",
  underperform: "danger"
};

export function getGscKeywordInsightLabel(status: GscKeywordInsightStatus): string {
  if (status === "none") return "未验证";
  return GSC_INSIGHT_LABEL[status];
}

export function getGscKeywordInsightTagType(
  status: GscKeywordInsightStatus
): KeywordDisplayStatusType {
  if (status === "none") return "info";
  return GSC_INSIGHT_TAG[status];
}

export function getGscKeywordInsightHint(insight: GscKeywordInsight): string {
  const base = `近 ${insight.periodDays} 天本站 Google 搜索：展示 ${insight.impressions}、点击 ${insight.clicks}、排名 ${insight.position.toFixed(1)}`;
  if (insight.status === "traffic") return `${base}。已带来点击，可继续观察或优化。`;
  if (insight.status === "impressions") {
    return `${base}。已有曝光，建议优先排产或优化标题。`;
  }
  if (insight.status === "underperform") {
    return `${base}。表现偏弱，建议重新优化或改稿。`;
  }
  return "暂无本站 Google 搜索数据";
}

export function hasGscKeywordVerification(
  insight?: GscKeywordInsight | null
): insight is GscKeywordInsight {
  return Boolean(insight && insight.status !== "none");
}

/** 将 GSC 已验证搜索词格式化为 AI 种子词 topicHint */
export function buildGscSeedTopicHint(queries: string[]): string {
  const cleaned = queries.map((q) => q.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) {
    return `围绕本站 Google 搜索词「${cleaned[0]}」扩展相关长尾选题`;
  }
  return `围绕以下本站 Google 搜索词扩展相关长尾选题：${cleaned.map((q) => `「${q}」`).join("、")}`;
}
