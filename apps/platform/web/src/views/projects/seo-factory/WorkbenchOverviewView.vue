<!--
  SEO 工厂项目概览：流水线、运营待办与操作指引。

  边界：
  - 不负责：任务详情（JobDetailView）
-->
<template>
  <div class="seo-overview">
    <div v-if="sites.length > 1" class="seo-overview__scope">
      <span class="seo-overview__scope-label">数据范围</span>
      <el-select
        v-model="filterSiteId"
        clearable
        size="small"
        placeholder="全部站点"
        style="width: 160px"
        @change="onSiteFilterChange"
      >
        <el-option
          v-for="site in sites"
          :key="site.id"
          :label="site.domain"
          :value="site.id"
        />
      </el-select>
    </div>

    <SetupChecklistPanel
      v-if="!projectSetupAllDone"
      v-loading="projectSetupLoading"
      class="seo-overview__setup"
      title="项目上手清单"
      description="按顺序完成配置，产线即可稳定出稿。"
      :items="projectSetupItems"
    />

    <div class="overview-layout">
      <WorkbenchTodoPanel :loading="loading" :items="todoItems" />

      <section v-if="stats?.siteCount === 0" class="overview-panel">
        <header class="overview-panel__head">
          <div>
            <span class="overview-panel__kicker">快速开始</span>
            <h2 class="overview-panel__title">快速开始</h2>
            <p class="overview-panel__desc">
              新项目先配置站点素材，再从关键词或任务入口开始排产。
            </p>
          </div>
        </header>
        <div class="overview-panel__body">
          <div class="space-y-3">
            <el-alert
              type="warning"
              :closable="false"
              show-icon
              title="第一步：创建站点"
              description="填写域名与公司卖点后，才能提交文章生成任务。CMS 与搜索表现请在「站点 → 发布集成 / 搜索表现」中配置。"
            />
            <el-button type="primary" class="quick-action" @click="goSites">
              <WorkbenchIcon name="globe" :size="14" class="mr-1" />
              去创建站点
            </el-button>
          </div>
        </div>
      </section>
    </div>

    <WorkbenchPipelineStrip :steps="pipelineSteps" />

    <div class="overview-layout">
      <TopicClusterGrid
        :loading="clustersLoading"
        :clusters="clusterHighlights"
        :keyword-queueable-count="stats?.keywordQueueableCount ?? 0"
        @select="goTopicCluster"
        @go-all="goTopicClusters"
        @go-queueable="goKeywordsQueueable"
      />

      <section class="overview-panel overview-guide">
        <header class="overview-panel__head">
          <div>
            <span class="overview-panel__kicker">运营流程</span>
            <h2 class="overview-panel__title">运营流程</h2>
            <p class="overview-panel__desc">
              推荐用法是先统一站点素材，再按主题排产，最后用搜索表现反哺改稿。
            </p>
          </div>
        </header>
        <div class="overview-panel__body">
          <el-collapse v-model="guideExpanded">
            <el-collapse-item title="一篇文章从创建到上线" name="flow">
              <ol class="list-decimal space-y-2 pl-5 text-sm leading-relaxed mw-text-body">
                <li><strong>站点</strong>：填域名、品牌语气、<strong>公司卖点（AI 写作素材）</strong>。</li>
                <li><strong>选题</strong>：把相关词归到同一专题，按组创建文章任务、看完成进度。</li>
                <li><strong>新建任务</strong>：选站点与关键词，可选<strong>搜索意图</strong>。</li>
                <li><strong>大纲待确认</strong>：核对 AI 大纲，确认后再生成正文。</li>
                <li><strong>等待生成</strong>：系统自动分析搜索结果并生成正文，可在任务详情看进度。</li>
                <li><strong>审核与编辑</strong>：敏感内容人工放行，必要时在线改稿并重新检查。</li>
                <li><strong>发布与复盘</strong>：推送 CMS 或导出，再用 Google 搜索表现反哺优化。</li>
              </ol>
            </el-collapse-item>
            <el-collapse-item title="核心名词" name="glossary">
              <dl class="space-y-3 text-sm leading-relaxed mw-text-body">
                <div>
                  <dt class="font-medium">大纲</dt>
                  <dd class="mw-text-muted">生成正文前的写作方案，可人工确认后再写稿。</dd>
                </div>
                <div>
                  <dt class="font-medium">公司卖点 / CTA</dt>
                  <dd class="mw-text-muted">在站点里填一次，每篇文章自动带上行业、资质与文末询盘引导。</dd>
                </div>
                <div>
                  <dt class="font-medium">专题</dt>
                  <dd class="text-gray-600">把一组相关关键词归在一起，方便按专题排产。</dd>
                </div>
                <div>
                  <dt class="font-medium">Google 搜索表现</dt>
                  <dd class="mw-text-muted">查看站点在 Google 上的点击、展示与排名。</dd>
                </div>
              </dl>
            </el-collapse-item>
          </el-collapse>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getSeoFactoryProjectStats, rerunArticleOptimization } from "@/api/seo-factory/article-job";
import { listSites } from "@/api/seo-factory/site";
import { importGscKeywords } from "@/api/seo-factory/keyword";
import { listKeywordClusters, type KeywordClusterItem } from "@/api/seo-factory/keyword-cluster";
import type { SeoFactoryProjectStats, SiteItem } from "@/api/seo-factory/types";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useProjectSetupChecklist } from "@/composables/seo-factory/useProjectSetupChecklist";
import SetupChecklistPanel from "@/components/SetupChecklistPanel.vue";
import WorkbenchIcon from "./components/WorkbenchIcon.vue";
import TopicClusterGrid from "./components/TopicClusterGrid.vue";
import WorkbenchTodoPanel from "./components/WorkbenchTodoPanel.vue";
import WorkbenchPipelineStrip from "./components/WorkbenchPipelineStrip.vue";
import { message } from "@/utils/message";

defineOptions({ name: "WorkbenchOverviewView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const { can } = useProjectSeoAccess();
const canManageGsc = computed(() => can("seo:site:manage"));
const canManageKeywords = computed(() => can("seo:keyword:manage"));
const {
  loading: projectSetupLoading,
  items: projectSetupItems,
  allDone: projectSetupAllDone
} = useProjectSetupChecklist(projectId);

const loading = ref(false);
const rerunningGscJobId = ref<string | null>(null);
const importingGscQuery = ref<string | null>(null);
const clustersLoading = ref(false);
const stats = ref<SeoFactoryProjectStats | null>(null);
const sites = ref<SiteItem[]>([]);
const filterSiteId = ref("");
const clusters = ref<KeywordClusterItem[]>([]);
const guideExpanded = ref<string[]>([]);
const cmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;

const clusterHighlights = computed(() => {
  const sorted = [...clusters.value].sort((a, b) => {
    const pendingDiff = (b.pendingCount ?? 0) - (a.pendingCount ?? 0);
    if (pendingDiff !== 0) return pendingDiff;
    return (b.keywordCount ?? 0) - (a.keywordCount ?? 0);
  });
  return sorted.filter((item) => (item.keywordCount ?? 0) > 0).slice(0, 3);
});

interface PipelineStep {
  id: string;
  label: string;
  count: number;
  action: () => void;
}

const pipelineSteps = computed<PipelineStep[]>(() => {
  const s = stats.value;
  if (!s) {
    return [
      { id: "brief", label: "待确认大纲", count: 0, action: goBriefPending },
      { id: "generating", label: "生成中", count: 0, action: goGenerating },
      { id: "review", label: "待审核", count: 0, action: goReviews },
      { id: "publish", label: "待发布", count: 0, action: goPublishPending },
      { id: "attention", label: "需处理", count: 0, action: goNeedsAttention }
    ];
  }

  const generatingCount = Math.max(0, s.activeJobs - s.pendingBriefCount);
  const needsAttention =
    s.failedJobs + s.staleDraftCount + (cmsUiEnabled ? s.cmsPublishFailedCount : 0);

  const steps: PipelineStep[] = [
    {
      id: "brief",
      label: "待确认大纲",
      count: s.pendingBriefCount,
      action: goBriefPending
    },
    {
      id: "generating",
      label: "生成中",
      count: generatingCount,
      action: goGenerating
    },
    {
      id: "review",
      label: "待审核",
      count: s.pendingReviewCount,
      action: goReviews
    }
  ];

  if (cmsUiEnabled) {
    steps.push({
      id: "publish",
      label: "待发布",
      count: s.pendingPublishCount,
      action: goPublishPending
    });
  }

  steps.push({
    id: "attention",
    label: "需处理",
    count: needsAttention,
    action: goNeedsAttention
  });

  return steps;
});

interface TodoItem {
  id: string;
  tagLabel: string;
  tagType: "danger" | "warning" | "info";
  text: string;
  actionLabel: string;
  buttonType: "primary" | "warning" | "danger" | "default";
  action: () => void;
  secondaryActionLabel?: string;
  secondaryAction?: () => void;
  loading?: boolean;
}

const todoItems = computed<TodoItem[]>(() => {
  const s = stats.value;
  if (!s) return [];

  const items: TodoItem[] = [];

  if (s.siteCount === 0) {
    items.push({
      id: "site",
      tagLabel: "必做",
      tagType: "danger",
      text: "还没有站点，无法创建文章任务",
      actionLabel: "创建站点",
      buttonType: "primary",
      action: goSites
    });
    return items;
  }

  if ((s.myAssignedCount ?? 0) > 0) {
    items.push({
      id: "assigned-me",
      tagLabel: "我的",
      tagType: "warning",
      text: `${s.myAssignedCount} 篇任务指派给您，请及时处理`,
      actionLabel: "查看",
      buttonType: "primary",
      action: goAssignedToMe
    });
  }

  if (s.canReviewInProject && (s.myReviewPendingCount ?? 0) > 0) {
    items.push({
      id: "review-me",
      tagLabel: "审核",
      tagType: "warning",
      text: `${s.myReviewPendingCount} 篇待您确认大纲或敏感审核`,
      actionLabel: "去处理",
      buttonType: "warning",
      action: goMyReviewPending
    });
  }

  if (s.sitesMissingProfileCount > 0) {
    items.push({
      id: "profile",
      tagLabel: "站点",
      tagType: "warning",
      text: `${s.sitesMissingProfileCount} 个站点未填最少写作素材（行业 + 至少 1 条卖点）`,
      actionLabel: "去填写",
      buttonType: "warning",
      action: goSitesMissingProfile
    });
  }

  if (cmsUiEnabled && s.cmsPublishFailedCount > 0) {
    items.push({
      id: "cms-failed",
      tagLabel: "发布",
      tagType: "danger",
      text: `${s.cmsPublishFailedCount} 篇 CMS 推送失败，请检查站点凭证`,
      actionLabel: "查看失败",
      buttonType: "danger",
      action: goCmsPublishFailed
    });
  }

  if (canManageGsc.value && s.gscPendingSyncCount > 0) {
    items.push({
      id: "gsc-sync",
      tagLabel: "搜索",
      tagType: "info",
      text: `${s.gscPendingSyncCount} 个站点已连接 Google 但尚未同步数据`,
      actionLabel: "去同步",
      buttonType: "primary",
      action: goGsc
    });
  }

  if (canManageGsc.value && s.gscStaleSyncCount > 0) {
    items.push({
      id: "gsc-stale",
      tagLabel: "搜索",
      tagType: "warning",
      text: `${s.gscStaleSyncCount} 个站点搜索数据已超过 7 天未更新`,
      actionLabel: "去更新",
      buttonType: "warning",
      action: goGsc
    });
  }

  if (
    canManageKeywords.value &&
    s.gscPendingSyncCount === 0 &&
    s.gscStaleSyncCount === 0 &&
    (s.gscDiscoveredQueries?.length ?? 0) > 0
  ) {
    for (const row of s.gscDiscoveredQueries.slice(0, 3)) {
      items.push({
        id: `gsc-discover-${row.query}`,
        tagLabel: "选题",
        tagType: "info",
        text: `「${row.query}」在本站 Google 搜索中已有 ${row.impressions} 次展示，可扩展相关选题`,
        actionLabel: "AI 扩展",
        buttonType: "primary",
        action: () => goSeedFromGscQuery(row),
        secondaryActionLabel: "加入词库",
        secondaryAction: () => void handleImportDiscoveredQuery(row)
      });
    }
  }

  if (
    canManageGsc.value &&
    s.gscPendingSyncCount === 0 &&
    (s.gscUnderperformingJobs?.length ?? 0) > 0
  ) {
    for (const row of s.gscUnderperformingJobs.slice(0, 3)) {
      items.push({
        id: `gsc-underperform-${row.jobId}`,
        tagLabel: "搜索",
        tagType: "warning",
        text: `「${row.keyword}」展示 ${row.impressions}、点击 ${row.clicks}、排名 ${row.position.toFixed(1)}，建议优化改稿`,
        actionLabel: "重新优化",
        buttonType: "primary",
        loading: rerunningGscJobId.value === row.jobId,
        action: () => void handleGscRerunOptimization(row.jobId),
        secondaryActionLabel: "去改稿",
        secondaryAction: () => goUnderperformingJob(row.jobId)
      });
    }
  }

  return items;
});

async function loadStats() {
  loading.value = true;
  try {
    stats.value = await getSeoFactoryProjectStats(
      projectId,
      filterSiteId.value || undefined
    );
  } finally {
    loading.value = false;
  }
}

async function loadSites() {
  sites.value = await listSites(projectId);
}

function syncSiteFilterFromRoute() {
  const siteId = route.query.siteId;
  filterSiteId.value = typeof siteId === "string" ? siteId : "";
}

function onSiteFilterChange() {
  const query: Record<string, string> = {};
  if (filterSiteId.value) query.siteId = filterSiteId.value;
  router.replace({ name: "SeoFactoryOverview", params: { projectId }, query });
}

function navQuery(extra: Record<string, string> = {}) {
  const query = { ...extra };
  if (filterSiteId.value) query.siteId = filterSiteId.value;
  return query;
}

async function loadClusters() {
  clustersLoading.value = true;
  try {
    clusters.value = await listKeywordClusters(projectId);
  } finally {
    clustersLoading.value = false;
  }
}

function goJobs() {
  router.push({ name: "SeoFactoryJobs", params: { projectId } });
}

function goBriefPending() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage: "outlinePending" })
  });
}

function goGenerating() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage: "generating" })
  });
}

function goNeedsAttention() {
  const s = stats.value;
  if (!s) {
    goJobs();
    return;
  }
  if (s.failedJobs > 0) {
    goFailedJobs();
    return;
  }
  if (s.staleDraftCount > 0) {
    goStaleDraft();
    return;
  }
  if (cmsUiEnabled && s.cmsPublishFailedCount > 0) {
    goCmsPublishFailed();
    return;
  }
  goJobs();
}

function goSites() {
  router.push({ name: "SeoFactorySites", params: { projectId } });
}

function goSitesMissingProfile() {
  router.push({
    name: "SeoFactorySites",
    params: { projectId },
    query: { profile: "missing" }
  });
}

function goReviews() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage: "reviewPending" })
  });
}

function goAssignedToMe() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ assignedToMe: "1" })
  });
}

function goMyReviewPending() {
  const s = stats.value;
  const stage = s && s.pendingBriefCount > 0 ? "outlinePending" : "reviewPending";
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage })
  });
}

function goKeywords() {
  router.push({ name: "SeoFactoryKeywords", params: { projectId } });
}

function goKeywordsQueueable() {
  router.push({
    name: "SeoFactoryKeywords",
    params: { projectId },
    query: { queueable: "1" }
  });
}

function goTopicClusters() {
  router.push({ name: "SeoFactoryTopicClusters", params: { projectId } });
}

function goTopicCluster(clusterId: string) {
  router.push({
    name: "SeoFactoryTopicClusters",
    params: { projectId },
    query: { clusterId }
  });
}

async function goGsc() {
  try {
    const sites = await listSites(projectId);
    const target = sites[0];
    if (target) {
      router.push({
        name: "SeoFactorySiteDetail",
        params: { projectId, siteId: target.id },
        query: { tab: "search" }
      });
      return;
    }
  } catch {
    // 回退站点列表
  }
  router.push({ name: "SeoFactorySites", params: { projectId } });
}

function goGscKeywordImport() {
  router.push({
    name: "SeoFactoryKeywords",
    params: { projectId },
    query: { gscImport: "1" }
  });
}

function goSeedFromGscQuery(row: { query: string; siteId: string }) {
  const query: Record<string, string> = { seedTopic: row.query };
  if (row.siteId) query.seedSiteId = row.siteId;
  router.push({
    name: "SeoFactoryKeywords",
    params: { projectId },
    query
  });
}

async function handleImportDiscoveredQuery(row: {
  query: string;
  siteId: string;
}) {
  if (importingGscQuery.value) return;
  importingGscQuery.value = row.query;
  try {
    const result = await importGscKeywords(projectId, {
      items: [{ query: row.query, siteId: row.siteId || undefined }]
    });
    message(`已加入词库${result.skipped ? "（该词已存在）" : ""}`, { type: "success" });
    await loadStats();
  } catch (error) {
    message(error instanceof Error ? error.message : "加入词库失败", { type: "error" });
  } finally {
    importingGscQuery.value = null;
  }
}

function goUnderperformingJob(jobId: string) {
  router.push({
    name: "SeoFactoryJobDetail",
    params: { projectId, jobId },
    query: {
      tab: "draft",
      gsc: "underperform",
      ...(filterSiteId.value ? { siteId: filterSiteId.value } : {})
    }
  });
}

async function handleGscRerunOptimization(jobId: string) {
  if (rerunningGscJobId.value) return;
  rerunningGscJobId.value = jobId;
  try {
    await rerunArticleOptimization(projectId, jobId, { reason: "gsc_underperform" });
    message("已重新入队优化评分", { type: "success" });
    router.push({
      name: "SeoFactoryJobDetail",
      params: { projectId, jobId },
      query: {
        tab: "seo",
        gsc: "underperform",
        ...(filterSiteId.value ? { siteId: filterSiteId.value } : {})
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "重新优化失败";
    message(msg, { type: "error" });
  } finally {
    rerunningGscJobId.value = null;
  }
}

function goPublishPending() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage: "publishPending" })
  });
}

function goCmsPublishFailed() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage: "publishFailed" })
  });
}

function goFailedJobs() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage: "failed" })
  });
}

function goStaleDraft() {
  router.push({
    name: "SeoFactoryJobs",
    params: { projectId },
    query: navQuery({ stage: "staleDraft" })
  });
}

watch(
  () => route.query.siteId,
  () => {
    syncSiteFilterFromRoute();
    void loadStats();
  }
);

onMounted(() => {
  syncSiteFilterFromRoute();
  void loadSites();
  void loadStats();
  void loadClusters();
});
</script>
