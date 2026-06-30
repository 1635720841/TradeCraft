/** 站点 Google 搜索状态展示 */

import type { SiteGscListSummary } from "@/api/seo-factory/types";
import type { KeywordDisplayStatusType } from "./keyword-display";

export type SiteGscListStatus = SiteGscListSummary["status"];

const STATUS_LABEL: Record<SiteGscListStatus, string> = {
  not_enabled: "未开通",
  unbound: "未绑定",
  pending_sync: "待同步",
  stale: "待更新",
  error: "同步失败",
  synced: "已同步"
};

const STATUS_TAG: Record<SiteGscListStatus, KeywordDisplayStatusType> = {
  not_enabled: "info",
  unbound: "info",
  pending_sync: "warning",
  stale: "warning",
  error: "danger",
  synced: "success"
};

export function getSiteGscStatusLabel(status: SiteGscListStatus): string {
  return STATUS_LABEL[status];
}

export function getSiteGscStatusTagType(status: SiteGscListStatus): KeywordDisplayStatusType {
  return STATUS_TAG[status];
}

export function getSiteGscStatusHint(gsc?: SiteGscListSummary | null): string {
  if (!gsc) return "暂无 Google 搜索状态";
  if (gsc.status === "not_enabled") return "当前套餐未包含 Google 搜索控制台集成";
  if (gsc.status === "unbound") return "平台运营尚未为本站绑定 Google 搜索控制台";
  if (gsc.status === "pending_sync") return "已绑定，等待首次同步搜索数据";
  if (gsc.status === "stale") {
    return gsc.lastSyncAt
      ? `搜索数据可能已过期，上次同步于 ${formatSiteGscTime(gsc.lastSyncAt)}`
      : "搜索数据可能已过期，请前往设置刷新";
  }
  if (gsc.status === "error") return gsc.lastSyncError || "同步失败，请联系平台运营";
  if (gsc.status === "synced" && gsc.lastSyncAt) {
    return `数据已同步，更新于 ${formatSiteGscTime(gsc.lastSyncAt)}`;
  }
  return "搜索数据已就绪";
}

export function canOpenSiteGscView(gsc?: SiteGscListSummary | null): boolean {
  return Boolean(gsc && gsc.status !== "not_enabled");
}

function formatSiteGscTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN");
}
