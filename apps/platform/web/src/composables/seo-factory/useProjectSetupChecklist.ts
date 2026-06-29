/**
 * 项目内 Setup Checklist（站点 → 卖点 → 词库 → 任务 → 完成）。
 */

import { computed, ref, watch, type MaybeRefOrGetter, toValue } from "vue";
import { useRouter } from "vue-router";
import { getSeoFactoryProjectStats } from "@/api/seo-factory/article-job";
import type { SetupChecklistItem } from "@/types/setup-checklist";

export function useProjectSetupChecklist(projectId: MaybeRefOrGetter<string>) {
  const router = useRouter();

  const loading = ref(false);
  const stats = ref<{
    siteCount: number;
    sitesMissingProfileCount: number;
    keywordTotalCount: number;
    totalJobs: number;
    completedJobs: number;
  } | null>(null);

  async function refresh() {
    const id = toValue(projectId);
    if (!id) {
      stats.value = null;
      return;
    }
    loading.value = true;
    try {
      const data = await getSeoFactoryProjectStats(id);
      stats.value = {
        siteCount: data.siteCount,
        sitesMissingProfileCount: data.sitesMissingProfileCount,
        keywordTotalCount: data.keywordTotalCount,
        totalJobs: data.totalJobs,
        completedJobs: data.completedJobs
      };
    } catch {
      stats.value = null;
    } finally {
      loading.value = false;
    }
  }

  watch(() => toValue(projectId), () => void refresh(), { immediate: true });

  const allDone = computed(() => {
    const s = stats.value;
    if (!s) return false;
    return (
      s.siteCount > 0 &&
      s.sitesMissingProfileCount === 0 &&
      s.totalJobs > 0 &&
      s.completedJobs > 0
    );
  });

  const items = computed<SetupChecklistItem[]>(() => {
    const s = stats.value;
    const pid = toValue(projectId);
    const siteDone = (s?.siteCount ?? 0) > 0;
    const profileDone = siteDone && (s?.sitesMissingProfileCount ?? 0) === 0;
    const keywordDone = (s?.keywordTotalCount ?? 0) > 0;
    const jobCreated = (s?.totalJobs ?? 0) > 0;
    const jobCompleted = (s?.completedJobs ?? 0) > 0;

    return [
      {
        id: "site",
        label: "创建至少一个站点",
        done: siteDone,
        actionLabel: "去站点",
        onAction: () =>
          router.push({ name: "SeoFactorySites", params: { projectId: pid } })
      },
      {
        id: "profile",
        label: "填写站点公司卖点（AI 写作素材）",
        done: profileDone,
        actionLabel: "去填写",
        onAction: () =>
          router.push({
            name: "SeoFactorySites",
            params: { projectId: pid },
            query: { profile: "missing" }
          })
      },
      {
        id: "keywords",
        label: "维护选题库（推荐）",
        done: keywordDone,
        actionLabel: "去词库",
        onAction: () =>
          router.push({ name: "SeoFactoryKeywords", params: { projectId: pid } })
      },
      {
        id: "job",
        label: "创建首篇文章任务",
        done: jobCreated,
        actionLabel: "去新建",
        onAction: () =>
          router.push({ name: "SeoFactoryJobCreate", params: { projectId: pid } })
      },
      {
        id: "complete",
        label: "完成首篇文章生成",
        done: jobCompleted,
        actionLabel: "看任务",
        onAction: () => router.push({ name: "SeoFactoryJobs", params: { projectId: pid } })
      }
    ];
  });

  return { loading, items, refresh, allDone };
}
