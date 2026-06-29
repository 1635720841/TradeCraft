<!--
  选题 · 按主题：专题列表 + 组内关键词排产。

  边界：
  - 不负责：全库发现与导入（KeywordPoolView）
-->
<template>
  <div class="p-4">
    <div class="topic-center-layout">
      <aside class="topic-center-sidebar">
        <div class="topic-center-sidebar__head">
          <span class="topic-center-sidebar__title">专题</span>
          <el-button
            v-if="canManageKeywords"
            type="primary"
            size="small"
            @click="openCreateDialog"
          >
            新建
          </el-button>
        </div>

        <div v-loading="clustersLoading" class="topic-center-sidebar__list">
          <button
            v-for="cluster in clusters"
            :key="cluster.id"
            type="button"
            class="topic-center-cluster"
            :class="{ 'is-active': selectedClusterId === cluster.id }"
            @click="selectCluster(cluster.id)"
          >
            <span class="topic-center-cluster__name">{{ cluster.name }}</span>
            <span class="topic-center-cluster__meta">
              <el-tag
                v-if="(cluster.pendingCount ?? 0) > 0"
                size="small"
                type="warning"
              >
                待写 {{ cluster.pendingCount }}
              </el-tag>
              <el-tag v-else size="small" type="success">已完成</el-tag>
            </span>
          </button>

          <el-empty
            v-if="!clustersLoading && clusters.length === 0"
            :image-size="56"
            description="还没有专题"
          >
            <p class="mb-3 text-sm text-gray-500">
              可新建专题，或在「全部关键词」中勾选后「加入专题 → 新建专题」。
            </p>
            <el-button v-if="canManageKeywords" type="primary" size="small" @click="openCreateDialog">
              新建专题
            </el-button>
            <el-button size="small" @click="goUnclusteredKeywords">查看未分组词</el-button>
          </el-empty>
        </div>
      </aside>

      <main v-if="selectedCluster" class="topic-center-main">
        <header class="topic-center-main__head">
          <div>
            <h2 class="topic-center-main__title">{{ selectedCluster.name }}</h2>
            <p v-if="selectedCluster.description" class="topic-center-main__desc">
              {{ selectedCluster.description }}
            </p>
            <p v-if="selectedCluster.pillarKeyword?.keyword" class="topic-center-main__pillar">
              专题核心词：{{ selectedCluster.pillarKeyword.keyword }}
            </p>
          </div>
          <div class="topic-center-main__actions">
            <el-button
              v-if="(selectedCluster.pendingCount ?? 0) > 0 && canCreateJob"
              type="primary"
              :loading="batchCreating"
              @click="openBatchJobDialog"
            >
              创建任务（{{ selectedCluster.pendingCount }}）
            </el-button>
            <el-button v-if="canManageKeywords" @click="openEditDialog(selectedCluster)">
              编辑专题
            </el-button>
            <el-button @click="refreshClusterDetail">刷新</el-button>
          </div>
        </header>

        <div class="topic-center-main__progress">
          <div class="topic-center-main__progress-meta">
            <span>已排产 {{ selectedCluster.usedCount ?? 0 }} / 共 {{ selectedCluster.keywordCount ?? 0 }} 词</span>
            <span>{{ selectedCluster.progressPercent ?? 0 }}%</span>
          </div>
          <el-progress
            :percentage="selectedCluster.progressPercent ?? 0"
            :stroke-width="8"
            :status="(selectedCluster.progressPercent ?? 0) >= 100 ? 'success' : undefined"
          />
        </div>

        <el-alert
          v-if="nextBatchKeywords.length"
          class="topic-center-main__suggest"
          type="info"
          :closable="false"
          show-icon
          :title="`建议下一批：${nextBatchKeywords.map((item) => item.keyword).join('、')}`"
        >
          <template #default>
            <span class="text-sm text-gray-600">
              按建议优先级取前 {{ KEYWORD_NEXT_BATCH_SIZE }} 个待写词，可一键创建任务。
            </span>
            <el-button
              v-if="canCreateJob"
              class="ml-2"
              size="small"
              type="primary"
              :loading="nextBatchCreating"
              @click="handleCreateNextBatch"
            >
              创建这 {{ nextBatchKeywords.length }} 个任务
            </el-button>
          </template>
        </el-alert>

        <el-table
          v-loading="keywordsLoading"
          :data="clusterKeywords"
          stripe
          class="topic-center-main__table"
        >
          <el-table-column prop="keyword" label="关键词" min-width="180" show-overflow-tooltip />
          <el-table-column label="建议优先级" width="108">
            <template #default="{ row }">
              <el-tooltip :content="priorityHint(row.priorityScore)" placement="top">
                <el-tag :type="priorityTierTagType(row.priorityScore)" size="small">
                  {{ priorityTierLabel(row.priorityScore) }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column prop="intent" label="意图" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="dictTagType(keywordIntentDict, row.intent)">
                {{ dictLabel(keywordIntentDict, row.intent) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="88">
            <template #default="{ row }">
              <el-tag size="small" :type="displayStatus(row.status).type">
                {{ displayStatus(row.status).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="isKeywordQueueable(row.status) && canCreateJob"
                type="primary"
                link
                :loading="creatingJobId === row.id"
                @click="handleCreateJob(row as KeywordEntryItem)"
              >
                创建任务
              </el-button>
              <el-button
                v-if="row.lastJobId"
                type="primary"
                link
                @click="goJobDetail(row.lastJobId!)"
              >
                查看任务
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="本专题还没有关键词">
              <el-button type="primary" @click="goUnclusteredKeywords">
                从未分组关键词中添加
              </el-button>
            </el-empty>
          </template>
        </el-table>

        <div
          v-if="(clusterDetail?.keywordPagination?.total ?? 0) > keywordLimit"
          class="topic-center-main__pagination"
        >
          <el-pagination
            v-model:current-page="keywordPage"
            v-model:page-size="keywordLimit"
            :total="clusterDetail?.keywordPagination?.total ?? 0"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="loadClusterDetail"
            @size-change="onKeywordPageSizeChange"
          />
        </div>

        <div class="topic-center-main__footer">
          <el-button link type="primary" @click="goAllKeywordsForCluster">
            在全部关键词中管理本专题
          </el-button>
        </div>
      </main>

      <main v-else-if="!clustersLoading" class="topic-center-main topic-center-main--empty">
        <el-empty description="选择左侧专题，或新建专题后开始排产">
          <el-button v-if="canManageKeywords" type="primary" @click="openCreateDialog">
            新建专题
          </el-button>
          <el-button @click="goUnclusteredKeywords">先去添加未分组词</el-button>
        </el-empty>
      </main>
    </div>

    <el-dialog v-model="formDialogVisible" :title="editingId ? '编辑专题' : '新建专题'" width="480px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="专题名称" prop="name">
          <el-input v-model="form.name" placeholder="如：工业阀门选型" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="说明">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="可选：这组文章要覆盖的用户问题或产品方向"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item v-if="editingId" label="专题核心词">
          <el-select
            v-model="form.pillarKeywordId"
            class="w-full"
            clearable
            placeholder="可选：本专题的支柱页关键词"
            :loading="pillarKeywordsLoading"
          >
            <el-option
              v-for="item in pillarKeywordOptions"
              :key="item.id"
              :label="item.keyword"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
        <el-button
          v-if="editingId && canManageKeywords"
          type="danger"
          plain
          @click="handleDeleteSelected"
        >
          删除专题
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchJobDialogVisible" title="按专题创建任务" width="480px">
      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="说明"
        description="将为本专题下所有「待写」关键词各创建一个生成任务；已排产或已归档的会跳过。"
      />
      <el-form label-width="88px">
        <el-form-item label="专题">
          <span>{{ selectedCluster?.name }}</span>
        </el-form-item>
        <el-form-item label="待创建">
          <span>{{ selectedCluster?.pendingCount ?? 0 }} 个关键词</span>
        </el-form-item>
        <el-form-item label="目标站点">
          <el-select
            v-model="batchJobForm.siteId"
            class="w-full"
            placeholder="默认项目首个站点"
            clearable
            :loading="sitesLoading"
          >
            <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="配额">
          <span>{{ quotaPreview.previewText(selectedCluster?.pendingCount ?? 0) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchJobDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="batchCreating"
          :disabled="!quotaPreview.canConsume(selectedCluster?.pendingCount ?? 0)"
          @click="submitBatchCreateJobs"
        >
          确认创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { ElMessageBox } from "element-plus";
import {
  createKeywordCluster,
  createJobsFromCluster,
  deleteKeywordCluster,
  getKeywordClusterDetail,
  listKeywordClusters,
  updateKeywordCluster,
  type KeywordClusterDetail,
  type KeywordClusterItem
} from "@/api/seo-factory/keyword-cluster";
import {
  createJobFromKeyword,
  type KeywordEntryItem
} from "@/api/seo-factory/keyword";
import { listSites } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { keywordIntentDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useArticleQuotaPreview } from "@/composables/useArticleQuotaPreview";
import {
  getKeywordDisplayStatus,
  getKeywordPriorityTier,
  getKeywordPriorityTierHint,
  getKeywordPriorityTierLabel,
  getKeywordPriorityTierTagType,
  isKeywordQueueable,
  KEYWORD_NEXT_BATCH_SIZE
} from "@/utils/seo-factory/keyword-display";
import { keywordSchedulingContextKey } from "@/composables/seo-factory/keyword-scheduling-context";

defineOptions({ name: "TopicClusterView" });

const emit = defineEmits<{ refreshSummary: [] }>();

const schedulingCtx = inject(keywordSchedulingContextKey, null);

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const quotaPreview = useArticleQuotaPreview();
const canManageKeywords = computed(() => can("seo:keyword:manage"));
const canCreateJob = computed(() => can("seo:job:create"));

const clustersLoading = ref(false);
const keywordsLoading = ref(false);
const saving = ref(false);
const clusters = ref<KeywordClusterItem[]>([]);
const clusterDetail = ref<KeywordClusterDetail | null>(null);
const selectedClusterId = ref("");
const formDialogVisible = ref(false);
const batchJobDialogVisible = ref(false);
const batchCreating = ref(false);
const nextBatchCreating = ref(false);
const creatingJobId = ref<string | null>(null);
const sites = ref<SiteItem[]>([]);
const sitesLoading = ref(false);
const batchJobForm = reactive({ siteId: "" });
const editingId = ref("");
const formRef = ref<FormInstance>();
const keywordPage = ref(1);
const keywordLimit = ref(20);

const form = reactive({
  name: "",
  description: "",
  pillarKeywordId: "" as string | null
});

const pillarKeywordOptions = ref<Array<{ id: string; keyword: string }>>([]);
const pillarKeywordsLoading = ref(false);

const formRules: FormRules = {
  name: [
    { required: true, message: "请输入专题名称", trigger: "blur" },
    { min: 2, message: "至少 2 个字符", trigger: "blur" }
  ]
};

const selectedCluster = computed(() => {
  if (clusterDetail.value?.id === selectedClusterId.value) {
    return clusterDetail.value;
  }
  return clusters.value.find((item) => item.id === selectedClusterId.value) ?? null;
});

const clusterKeywords = computed(() =>
  clusterDetail.value?.id === selectedClusterId.value ? (clusterDetail.value.keywords ?? []) : []
);

const nextBatchKeywords = computed(() =>
  clusterDetail.value?.id === selectedClusterId.value
    ? (clusterDetail.value.nextBatchKeywords ?? [])
    : []
);

function displayStatus(status: string) {
  return getKeywordDisplayStatus(status);
}

function priorityTierLabel(score: number) {
  return getKeywordPriorityTierLabel(getKeywordPriorityTier(score));
}

function priorityTierTagType(score: number) {
  return getKeywordPriorityTierTagType(getKeywordPriorityTier(score));
}

function priorityHint(score: number) {
  return getKeywordPriorityTierHint(getKeywordPriorityTier(score));
}

function syncClusterFromRoute() {
  const clusterId = route.query.clusterId;
  if (typeof clusterId === "string" && clusterId) {
    selectedClusterId.value = clusterId;
  }
}

function selectCluster(clusterId: string) {
  if (selectedClusterId.value === clusterId) return;
  selectedClusterId.value = clusterId;
  keywordPage.value = 1;
  router.replace({
    name: "SeoFactoryTopicClusters",
    params: { projectId },
    query: { clusterId }
  });
  void loadClusterDetail();
}

async function loadClusters() {
  clustersLoading.value = true;
  try {
    clusters.value = await listKeywordClusters(projectId);
    if (!selectedClusterId.value && clusters.value.length > 0) {
      selectedClusterId.value = clusters.value[0].id;
    }
    if (
      selectedClusterId.value &&
      !clusters.value.some((item) => item.id === selectedClusterId.value)
    ) {
      selectedClusterId.value = clusters.value[0]?.id ?? "";
    }
    if (selectedClusterId.value) {
      await loadClusterDetail();
    } else {
      clusterDetail.value = null;
    }
  } finally {
    clustersLoading.value = false;
  }
}

async function loadClusterDetail() {
  if (!selectedClusterId.value) {
    clusterDetail.value = null;
    return;
  }
  keywordsLoading.value = true;
  try {
    clusterDetail.value = await getKeywordClusterDetail(
      projectId,
      selectedClusterId.value,
      keywordPage.value,
      keywordLimit.value
    );
  } finally {
    keywordsLoading.value = false;
  }
}

function onKeywordPageSizeChange() {
  keywordPage.value = 1;
  void loadClusterDetail();
}

async function refreshClusterDetail() {
  await loadClusters();
  notifySummaryRefresh();
}

function notifySummaryRefresh() {
  emit("refreshSummary");
  void schedulingCtx?.refreshSummary();
}

function goUnclusteredKeywords() {
  router.push({
    name: "SeoFactoryKeywords",
    params: { projectId },
    query: { unclustered: "1" }
  });
}

function resetForm() {
  form.name = "";
  form.description = "";
  form.pillarKeywordId = null;
  pillarKeywordOptions.value = [];
}

async function loadPillarKeywordOptions(clusterId: string) {
  pillarKeywordsLoading.value = true;
  try {
    const detail = await getKeywordClusterDetail(projectId, clusterId, 1, 200);
    pillarKeywordOptions.value = detail.keywords.map((item) => ({
      id: item.id,
      keyword: item.keyword
    }));
  } finally {
    pillarKeywordsLoading.value = false;
  }
}

function openCreateDialog() {
  editingId.value = "";
  resetForm();
  formDialogVisible.value = true;
}

function openEditDialog(cluster: KeywordClusterItem) {
  editingId.value = cluster.id;
  form.name = cluster.name;
  form.description = cluster.description ?? "";
  form.pillarKeywordId = cluster.pillarKeywordId ?? null;
  void loadPillarKeywordOptions(cluster.id);
  formDialogVisible.value = true;
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        pillarKeywordId: editingId.value ? form.pillarKeywordId || null : undefined
      };
      if (editingId.value) {
        await updateKeywordCluster(projectId, editingId.value, payload);
        message("专题已更新", { type: "success" });
      } else {
        const created = await createKeywordCluster(projectId, payload);
        message("专题已创建", { type: "success" });
        selectedClusterId.value = created.id;
        router.replace({
          name: "SeoFactoryTopicClusters",
          params: { projectId },
          query: { clusterId: created.id }
        });
      }
      formDialogVisible.value = false;
      await loadClusters();
      notifySummaryRefresh();
    } finally {
      saving.value = false;
    }
  });
}

async function handleDeleteSelected() {
  if (!selectedCluster.value) return;
  await handleDeleteCluster(selectedCluster.value);
  formDialogVisible.value = false;
}

async function handleDeleteCluster(cluster: KeywordClusterItem) {
  await ElMessageBox.confirm(
    `删除「${cluster.name}」后，组内关键词会变为未分组，不会删除关键词本身。`,
    "删除专题",
    { type: "warning" }
  );
  await deleteKeywordCluster(projectId, cluster.id);
  message("专题已删除", { type: "success" });
  if (selectedClusterId.value === cluster.id) {
    selectedClusterId.value = "";
    router.replace({ name: "SeoFactoryTopicClusters", params: { projectId } });
  }
  await loadClusters();
  notifySummaryRefresh();
}

function goAllKeywordsForCluster() {
  if (!selectedClusterId.value) return;
  router.push({
    name: "SeoFactoryKeywords",
    params: { projectId },
    query: { clusterId: selectedClusterId.value }
  });
}

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
  } finally {
    sitesLoading.value = false;
  }
}

function openBatchJobDialog() {
  if (!selectedCluster.value) return;
  batchJobForm.siteId = sites.value[0]?.id ?? "";
  batchJobDialogVisible.value = true;
  void quotaPreview.refreshQuota();
  if (sites.value.length === 0) {
    void loadSites();
  }
}

async function submitBatchCreateJobs() {
  if (!selectedCluster.value) return;
  const count = selectedCluster.value.pendingCount ?? 0;
  if (!quotaPreview.canConsume(count)) {
    message("本账期配额不足", { type: "warning" });
    return;
  }
  batchCreating.value = true;
  try {
    const result = await createJobsFromCluster(projectId, selectedCluster.value.id, {
      siteId: batchJobForm.siteId || undefined
    });
    message(`已创建 ${result.created} 个任务${result.skipped ? `，跳过 ${result.skipped} 个` : ""}`, {
      type: "success"
    });
    batchJobDialogVisible.value = false;
    await loadClusters();
    notifySummaryRefresh();
  } finally {
    batchCreating.value = false;
  }
}

async function handleCreateNextBatch() {
  if (!selectedCluster.value || nextBatchKeywords.value.length === 0) return;
  if (!quotaPreview.canConsume(nextBatchKeywords.value.length)) {
    message("本账期配额不足", { type: "warning" });
    return;
  }
  nextBatchCreating.value = true;
  try {
    const result = await createJobsFromCluster(projectId, selectedCluster.value.id, {
      siteId: sites.value[0]?.id,
      limit: KEYWORD_NEXT_BATCH_SIZE
    });
    message(`已创建 ${result.created} 个任务`, { type: "success" });
    await loadClusters();
    notifySummaryRefresh();
  } finally {
    nextBatchCreating.value = false;
  }
}

async function handleCreateJob(row: KeywordEntryItem) {
  creatingJobId.value = row.id;
  try {
    const result = await createJobFromKeyword(projectId, row.id, row.siteId ?? undefined);
    message("任务已创建", { type: "success" });
    await loadClusters();
    notifySummaryRefresh();
    router.push({
      name: "SeoFactoryJobDetail",
      params: { projectId, jobId: result.job.id }
    });
  } finally {
    creatingJobId.value = null;
  }
}

function goJobDetail(jobId: string) {
  router.push({ name: "SeoFactoryJobDetail", params: { projectId, jobId } });
}

watch(
  () => route.query.clusterId,
  () => {
    syncClusterFromRoute();
    if (selectedClusterId.value) {
      void loadClusterDetail();
    }
  }
);

onMounted(() => {
  syncClusterFromRoute();
  void loadClusters();
  void loadSites();
});
</script>
