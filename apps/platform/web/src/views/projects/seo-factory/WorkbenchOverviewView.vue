<!--
  SEO 工厂项目概览：流水线、运营待办与操作指引。

  边界：
  - 不负责：任务详情（JobDetailView）
-->
<template>
  <div class="p-4 space-y-4">
    <div v-if="sites.length > 1" class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-gray-500">查看站点</span>
      <el-select
        v-model="filterSiteId"
        clearable
        placeholder="全部站点"
        style="width: 200px"
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

    <el-card v-loading="loading" shadow="never">
      <template #header>
        <span class="font-medium">今日待办</span>
      </template>

      <el-empty v-if="todoItems.length === 0" description="暂无紧急待办，可新建任务或查看列表" />

      <div v-else class="space-y-3">
        <div
          v-for="item in todoItems"
          :key="item.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--el-border-color-light)] px-3 py-2"
        >
          <div class="flex items-start gap-2">
            <el-tag :type="item.tagType" size="small">{{ item.tagLabel }}</el-tag>
            <span class="text-sm leading-relaxed">{{ item.text }}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <el-button
              v-if="item.secondaryAction"
              size="small"
              @click="item.secondaryAction"
            >
              {{ item.secondaryActionLabel }}
            </el-button>
            <el-button
              size="small"
              :type="item.buttonType"
              :loading="item.loading"
              @click="item.action"
            >
              {{ item.actionLabel }}
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <span class="font-medium">内容流水线</span>
      </template>

      <div class="pipeline-strip">
        <button
          v-for="step in pipelineSteps"
          :key="step.id"
          type="button"
          class="pipeline-step"
          :class="{ 'pipeline-step--active': step.count > 0 }"
          @click="step.action"
        >
          <span class="pipeline-step__count">{{ step.count }}</span>
          <span class="pipeline-step__label">{{ step.label }}</span>
        </button>
      </div>
    </el-card>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="14">
        <el-card shadow="never">
          <template #header>
            <span class="font-medium">快速开始</span>
          </template>

          <div v-if="stats?.siteCount === 0" class="space-y-3">
            <el-alert
              type="warning"
              :closable="false"
              show-icon
              title="第一步：创建站点"
              description="填写域名与公司卖点后，才能提交文章生成任务。CMS 与搜索表现请在「设置」中配置。"
            />
            <el-button type="primary" @click="goSites">去创建站点</el-button>
          </div>

          <div v-else class="flex flex-wrap gap-2">
            <el-button type="primary" @click="goCreate">新建文章任务</el-button>
            <el-button @click="goJobs">查看任务列表</el-button>
            <el-button @click="goSites">站点</el-button>
            <el-button @click="goKeywords">关键词池</el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="10">
        <el-card
          v-if="clusterHighlights.length"
          v-loading="clustersLoading"
          shadow="never"
        >
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium">主题排产</span>
              <el-button link type="primary" @click="goTopicClusters">全部主题</el-button>
            </div>
          </template>

          <div class="space-y-3">
            <div
              v-for="cluster in clusterHighlights"
              :key="cluster.id"
              class="rounded border border-[var(--el-border-color-light)] px-3 py-2"
            >
              <div class="mb-1 flex items-center justify-between gap-2">
                <span class="text-sm font-medium">{{ cluster.name }}</span>
                <el-tag v-if="(cluster.pendingCount ?? 0) > 0" size="small" type="warning">
                  待写 {{ cluster.pendingCount }}
                </el-tag>
                <el-tag v-else size="small" type="success">已完成</el-tag>
              </div>
              <el-progress
                :percentage="cluster.progressPercent ?? 0"
                :stroke-width="6"
                :status="(cluster.progressPercent ?? 0) >= 100 ? 'success' : undefined"
              />
            </div>
          </div>
        </el-card>

        <el-card
          v-else-if="stats && stats.keywordQueueableCount > 0"
          shadow="never"
        >
          <template #header>
            <span class="font-medium">词库</span>
          </template>
          <p class="mb-3 text-sm text-gray-600">
            {{ stats.keywordQueueableCount }} 个关键词可入队
          </p>
          <el-button type="primary" size="small" @click="goKeywordsQueueable">
            去入队
          </el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <template #header>
        <span class="font-medium">运营怎么用这个系统？</span>
      </template>

      <el-collapse v-model="guideExpanded">
        <el-collapse-item title="一篇文章从创建到上线（推荐顺序）" name="flow">
          <ol class="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
            <li>
              <strong>站点</strong>：填域名、品牌语气、<strong>公司卖点（AI 写作素材）</strong>。
            </li>
            <li>
              <strong>词库</strong>：把相关词归到同一主题，按组排产、看完成进度。
            </li>
            <li>
              <strong>新建任务</strong>：选站点与关键词，可选<strong>搜索意图</strong>。
            </li>
            <li>
              <strong>大纲待确认</strong>（站点开启时）：核对 AI 大纲，确认后再生成正文。
            </li>
            <li>
              <strong>等待生成</strong>：系统自动分析搜索结果并生成正文；可在任务详情看进度。
            </li>
            <li>
              <strong>敏感内容审核</strong>（YMYL）：人工放行后才能导出 / 推送。
            </li>
            <li>
              <strong>编辑（可选）</strong>：在线改正文；改完后若提示「需重新检查」，请在任务详情按提示操作。
            </li>
            <li>
              <strong>发布</strong>：推送到 CMS 或批量导出 zip。
            </li>
            <li>
              <strong>搜索表现（可选）</strong>：管理员在「设置」连接 Google 搜索控制台，查看点击与排名。
            </li>
          </ol>
        </el-collapse-item>
        <el-collapse-item title="名词解释" name="glossary">
          <dl class="space-y-3 text-sm leading-relaxed text-gray-700">
            <div>
              <dt class="font-medium">大纲（Brief）</dt>
              <dd class="text-gray-600">生成正文前的写作方案，可人工确认后再写稿。</dd>
            </div>
            <div>
              <dt class="font-medium">搜索意图</dt>
              <dd class="text-gray-600">用户搜这个词想干什么，影响文章结构和 CTA。</dd>
            </div>
            <div>
              <dt class="font-medium">公司卖点 / CTA</dt>
              <dd class="text-gray-600">在站点里填一次，每篇文章自动带上行业、资质与文末询盘引导。</dd>
            </div>
            <div>
              <dt class="font-medium">YMYL</dt>
              <dd class="text-gray-600">涉及健康/金融等敏感话题，需人工审核后才能发布。</dd>
            </div>
            <div>
              <dt class="font-medium">CMS 推送</dt>
              <dd class="text-gray-600">把已完成文章推到 WordPress 或 Shopify，默认多为草稿。</dd>
            </div>
            <div>
              <dt class="font-medium">主题集群</dt>
              <dd class="text-gray-600">把一组相关关键词归在一起，方便按主题排产。</dd>
            </div>
            <div>
              <dt class="font-medium">Google 搜索表现</dt>
              <dd class="text-gray-600">查看站点在 Google 上的点击、展示与排名。</dd>
            </div>
          </dl>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getSeoFactoryProjectStats, rerunArticleOptimization } from "@/api/seo-factory/article-job";
import { listKeywordClusters, type KeywordClusterItem } from "@/api/seo-factory/keyword-cluster";
import { listSites } from "@/api/seo-factory/site";
import type { SeoFactoryProjectStats, SiteItem } from "@/api/seo-factory/types";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { useUserStoreHook } from "@/store/modules/user";
import { message } from "@/utils/message";

defineOptions({ name: "WorkbenchOverviewView" });

const route = useRoute();
const router = useRouter();
const userStore = useUserStoreHook();
const projectId = route.params.projectId as string;

const isAdmin = computed(() => userStore.roles.includes("admin"));

const loading = ref(false);
const rerunningGscJobId = ref<string | null>(null);
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

  if (s.sitesMissingProfileCount > 0) {
    items.push({
      id: "profile",
      tagLabel: "站点",
      tagType: "warning",
      text: `${s.sitesMissingProfileCount} 个站点未填公司卖点，文章可能缺少行业信息、产品线或询盘引导`,
      actionLabel: "去填写",
      buttonType: "warning",
      action: goSitesMissingProfile
    });
  }

  if (s.pendingBriefCount > 0) {
    items.push({
      id: "brief",
      tagLabel: "大纲",
      tagType: "warning",
      text: `${s.pendingBriefCount} 篇大纲等待确认，确认后才会生成正文`,
      actionLabel: "去确认",
      buttonType: "warning",
      action: goBriefPending
    });
  }

  if (s.pendingReviewCount > 0) {
    items.push({
      id: "ymyl",
      tagLabel: "审核",
      tagType: "warning",
      text: `${s.pendingReviewCount} 篇敏感内容待人工审核`,
      actionLabel: "去审核",
      buttonType: "warning",
      action: goReviews
    });
  }

  if (s.staleDraftCount > 0) {
    items.push({
      id: "stale-draft",
      tagLabel: "稿件",
      tagType: "warning",
      text: `${s.staleDraftCount} 篇正文改过后待处理，需重新检查评分或导出`,
      actionLabel: "去处理",
      buttonType: "warning",
      action: goStaleDraft
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

  if (cmsUiEnabled && s.pendingPublishCount > 0) {
    items.push({
      id: "cms-pending",
      tagLabel: "发布",
      tagType: "info",
      text: `${s.pendingPublishCount} 篇已完成但未推送到 CMS`,
      actionLabel: "去推送",
      buttonType: "primary",
      action: goPublishPending
    });
  }

  if (s.failedJobs > 0) {
    items.push({
      id: "failed",
      tagLabel: "失败",
      tagType: "danger",
      text: `${s.failedJobs} 篇任务生成失败，可在列表批量重新生成`,
      actionLabel: "查看失败",
      buttonType: "default",
      action: goFailedJobs
    });
  }

  if (isAdmin.value && s.gscPendingSyncCount > 0) {
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

  if (isAdmin.value && s.gscStaleSyncCount > 0) {
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

function goCreate() {
  router.push({ name: "SeoFactoryJobCreate", params: { projectId } });
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

function goGsc() {
  router.push({ name: "SeoFactorySettings", params: { projectId }, hash: "#gsc" });
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

<style scoped>
.pipeline-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pipeline-step {
  flex: 1 1 120px;
  min-width: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: border-color 0.2s;
}

.pipeline-step:hover {
  border-color: var(--el-color-primary);
}

.pipeline-step--active .pipeline-step__count {
  color: var(--el-color-primary);
}

.pipeline-step__count {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
  color: var(--el-text-color-secondary);
}

.pipeline-step__label {
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
  text-align: center;
}
</style>
