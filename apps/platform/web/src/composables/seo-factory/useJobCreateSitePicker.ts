/**
 * 创建任务页：站点列表、最近选用站点与展示文案。
 */
import { ref } from "vue";
import { listSites } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { formatTargetMarketsLabel } from "@/utils/seo-factory/target-market";

export function useJobCreateSitePicker(projectId: string) {
  const sites = ref<SiteItem[]>([]);
  const sitesLoading = ref(false);

  function lastSiteStorageKey() {
    return `seo-factory:last-site:${projectId}`;
  }

  function rememberLastSite(siteId: string) {
    if (!siteId) return;
    localStorage.setItem(lastSiteStorageKey(), siteId);
  }

  function resolveLastSiteId(): string | null {
    const saved = localStorage.getItem(lastSiteStorageKey());
    if (!saved) return null;
    return sites.value.some((site) => site.id === saved) ? saved : null;
  }

  function siteOptionSubline(site: SiteItem): string | undefined {
    const bits: string[] = [];
    if (site.contentLanguage === "zh-CN") bits.push("简体中文");
    else if (site.contentLanguage === "en") bits.push("英文");
    if (site.targetMarkets?.length || site.targetMarket) {
      bits.push(formatTargetMarketsLabel(site.targetMarkets ?? site.targetMarket, ""));
    }
    return bits.length ? bits.join(" · ") : undefined;
  }

  function siteFieldDescription(site?: SiteItem): string {
    if (!site) return "将按该站配置写稿。";
    return siteOptionSubline(site) ? "将按该站语言与市场配置生成。" : "将按该站配置写稿。";
  }

  async function loadSites() {
    sitesLoading.value = true;
    try {
      sites.value = await listSites(projectId);
    } finally {
      sitesLoading.value = false;
    }
  }

  function findSite(siteId: string) {
    return sites.value.find((site) => site.id === siteId);
  }

  return {
    sites,
    sitesLoading,
    loadSites,
    rememberLastSite,
    resolveLastSiteId,
    findSite,
    siteOptionSubline,
    siteFieldDescription
  };
}
