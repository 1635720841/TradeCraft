/**
 * 任务详情 Tab 与诊断分区导航。
 */
import { nextTick, ref, watch, type Ref } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import type { ArticleJobItem } from "@/api/seo-factory/types";
import type { DiagnoseSection } from "@/utils/seo-factory/job-detail-summary";
import type ArticleJobDiagnosePanel from "@/views/projects/seo-factory/components/ArticleJobDiagnosePanel.vue";

export function useJobDiagnoseNav(options: {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  projectId: Ref<string>;
  job: Ref<ArticleJobItem | null | undefined>;
}) {
  const activeTab = ref<"article" | "diagnose" | "brief">("article");
  const diagnosePanelRef = ref<InstanceType<typeof ArticleJobDiagnosePanel> | null>(null);

  function goDetailTab(tab: "article" | "diagnose" | "brief", section?: DiagnoseSection) {
    activeTab.value = tab;
    if (tab === "diagnose" && section) {
      void nextTick(() => {
        void nextTick(() => {
          diagnosePanelRef.value?.scrollToLegacySection(section);
        });
      });
    }
  }

  function syncTabFromQuery() {
    const tab = options.route.query.tab;
    if (tab === "article" || tab === "diagnose" || tab === "brief") {
      activeTab.value = tab;
    }
    const section = options.route.query.section;
    if (activeTab.value === "diagnose" && typeof section === "string") {
      void nextTick(() => {
        diagnosePanelRef.value?.scrollToLegacySection(section as DiagnoseSection);
      });
    }
  }

  function goBack() {
    options.router.push({
      name: "SeoFactoryJobs",
      params: { projectId: options.projectId.value }
    });
  }

  function goSiteManage() {
    options.router.push({
      name: "SeoFactorySites",
      params: { projectId: options.projectId.value }
    });
  }

  watch(
    () => options.job.value?.briefData?.approvalStatus,
    (status) => {
      if (status === "pending") goDetailTab("brief");
    },
    { immediate: true }
  );

  return {
    activeTab,
    diagnosePanelRef,
    goDetailTab,
    syncTabFromQuery,
    goBack,
    goSiteManage
  };
}
