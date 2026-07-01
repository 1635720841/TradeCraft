<!--
  选题 · 全部关键词：发现、筛选与创建任务。

  边界：
  - 不负责：专题排产主界面（TopicClusterView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">全部关键词</span>
          <div class="flex flex-wrap gap-2">
            <el-button v-if="canManageKeywords" type="primary" @click="openCreateDialog">添加关键词</el-button>
            <el-button
              type="primary"
              :disabled="selectedKeywords.length === 0"
              :loading="batchCreating"
              @click="openBatchJobDialog"
            >
              创建任务{{ selectedKeywords.length > 0 ? `（${selectedKeywords.length}）` : "" }}
            </el-button>
            <el-button v-if="canManageKeywords" @click="openImportDialog">批量导入</el-button>
            <el-tooltip
              v-if="canManageKeywords"
              content="来自您站点在 Google 搜索控制台的真实搜索词，尚未加入词库"
              placement="top"
            >
              <el-button @click="openGscImportDialog">本站 Google 搜索词</el-button>
            </el-tooltip>
            <el-button v-if="canManageKeywords" @click="openSeedDialog()">AI 生成种子词</el-button>
            <el-button @click="fetchKeywords">刷新</el-button>
          </div>
        </div>
      </template>

      <el-collapse class="mb-4">
        <el-collapse-item title="优先级怎么理解？" name="priority">
          <p class="text-sm leading-relaxed text-gray-600">
            系统综合商业价值与内容匹配，给出<strong>高 / 中 / 低</strong>建议优先级。
            AI 生成种子词时会一并评估；导入 CSV 时第二列可填专题名称。
          </p>
        </el-collapse-item>
      </el-collapse>

      <KeywordPoolFilters
        v-model:quick-filter="quickFilter"
        v-model:filter-status="filterStatus"
        v-model:filter-intent="filterIntent"
        v-model:filter-cluster-id="filterClusterId"
        :clusters="clusters"
        :scheduling-summary="schedulingSummary"
        :active-filter-title="activeFilterTitle"
        :selected-count="selectedKeywords.length"
        :can-manage-keywords="canManageKeywords"
        :deleting="deleting"
        @quick-filter-change="onQuickFilterChange"
        @filter-change="onFilterChange"
        @cluster-filter-change="onClusterFilterChange"
        @clear-filters="clearAllFilters"
        @go-unclustered="goUnclusteredFilter"
        @assign-cluster="openAssignClusterDialog"
        @batch-delete="handleBatchDelete"
      />

      <KeywordPoolTable
        ref="keywordTableRef"
        v-model:page="page"
        v-model:limit="limit"
        :loading="loading"
        :keywords="keywords"
        :can-manage-keywords="canManageKeywords"
        :creating-job-id="creatingJobId"
        :deleting-id="deletingId"
        :total="total"
        :empty-keyword-hint="emptyKeywordHint"
        @selection-change="handleSelectionChange"
        @create-job="handleCreateJob"
        @go-job-detail="goJobDetail"
        @edit-row="openEditDialog"
        @delete-row="handleDelete"
        @expand-from-gsc="expandKeywordFromGsc"
        @page-change="fetchKeywords"
        @size-change="onSizeChange"
      />
    </el-card>

    <KeywordFormDialog
      ref="formDialogRef"
      v-model:visible="formDialogVisible"
      :editing-id="editingId"
      :form="form"
      :clusters="clusters"
      :saving="saving"
      :form-rules="formRules"
      @save="submitForm"
    />

    <KeywordSeedDialog
      ref="seedDialogUiRef"
      v-model:visible="seedDialogVisible"
      :step="seedStep"
      :from-gsc="seedFromGsc"
      :sites="seedSites"
      :sites-loading="seedSitesLoading"
      :form="seedForm"
      :candidates="seedCandidates"
      :generating="generatingSeeds"
      :confirming="confirmingSeeds"
      :selected-count="selectedSeedCandidates.length"
      @closed="resetSeedDialog"
      @preview="submitPreviewSeeds"
      @confirm="submitConfirmSeeds"
      @back="goBackSeedDialog"
      @selection-change="handleSeedSelectionChange"
    />

    <KeywordBatchJobDialog
      v-model:visible="batchJobDialogVisible"
      v-model:site-id="batchJobForm.siteId"
      :selected-count="selectedKeywords.length"
      :sites="sites"
      :sites-loading="sitesLoading"
      :quota-preview-text="batchQuotaPreviewText"
      :quota-can-consume="batchQuotaCanConsume"
      :creating="batchCreating"
      @submit="submitBatchCreateJobs"
    />

    <KeywordImportDialog
      v-model:visible="importDialogVisible"
      v-model:text="importText"
      :importing="importing"
      @import="submitImport"
    />

    <KeywordGscImportDialog
      v-model:visible="gscImportDialogVisible"
      :loading="gscDiscoveredLoading"
      :queries="gscDiscoveredQueries"
      :importing="importingGsc"
      :selected-count="selectedGscDiscovered.length"
      @selection-change="handleGscDiscoveredSelection"
      @import="submitGscImport"
      @expand-seeds="expandGscSelectionToSeeds"
    />

    <KeywordClusterAssignDialog
      v-model="assignClusterDialogVisible"
      :project-id="projectId"
      :clusters="clusters"
      :keyword-ids="selectedKeywordIds"
      @assigned="onClusterAssigned"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormRules } from "element-plus";
import {
  createJobFromKeyword,
  createJobsFromKeywords,
  createKeyword,
  deleteKeyword,
  deleteKeywords,
  importGscKeywords,
  importKeywords,
  listGscDiscoveredQueries,
  updateKeyword,
  type CreateKeywordPayload,
  type GscDiscoveredQuery,
  type KeywordEntryItem
} from "@/api/seo-factory/keyword";
import { listSites } from "@/api/seo-factory/site";
import { getSiteKeywordConflicts } from "@/api/seo-factory/keyword-conflict";
import type { SiteItem } from "@/api/seo-factory/types";
import { ElMessageBox } from "element-plus";
import { buildGscSeedTopicHint } from "@/utils/seo-factory/gsc-keyword-display";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useKeywordPoolData } from "@/composables/seo-factory/useKeywordPoolData";
import { useKeywordSeedDialog } from "@/composables/seo-factory/useKeywordSeedDialog";
import { useArticleQuotaPreview } from "@/composables/useArticleQuotaPreview";
import { keywordSchedulingContextKey } from "@/composables/seo-factory/keyword-scheduling-context";
import KeywordBatchJobDialog from "./components/KeywordBatchJobDialog.vue";
import KeywordClusterAssignDialog from "./components/KeywordClusterAssignDialog.vue";
import KeywordFormDialog from "./components/KeywordFormDialog.vue";
import KeywordGscImportDialog from "./components/KeywordGscImportDialog.vue";
import KeywordImportDialog from "./components/KeywordImportDialog.vue";
import KeywordPoolFilters from "./components/KeywordPoolFilters.vue";
import KeywordPoolTable from "./components/KeywordPoolTable.vue";
import KeywordSeedDialog from "./components/KeywordSeedDialog.vue";

defineOptions({ name: "KeywordPoolView" });

const emit = defineEmits<{ refreshSummary: [] }>();

const schedulingCtx = inject(keywordSchedulingContextKey, null);
const schedulingSummary = computed(() => schedulingCtx?.summary.value ?? null);

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const quotaPreview = useArticleQuotaPreview();
const canManageKeywords = computed(() => can("seo:keyword:manage"));
const canCreateJob = computed(() => can("seo:job:create"));

const emptyKeywordHint = computed(() =>
  canManageKeywords.value
    ? "暂无关键词，请添加或批量导入"
    : "暂无关键词，请联系管理员导入；您可勾选后批量创建任务"
);

const {
  loading,
  keywords,
  page,
  limit,
  total,
  filterStatus,
  filterIntent,
  filterClusterId,
  quickFilter,
  clusters,
  activeFilterTitle,
  fetchKeywords,
  loadClusters,
  goUnclusteredFilter,
  onQuickFilterChange,
  onFilterChange,
  onClusterFilterChange,
  clearAllFilters,
  onSizeChange
} = useKeywordPoolData(projectId);

const saving = ref(false);
const importing = ref(false);
const batchCreating = ref(false);
const sitesLoading = ref(false);
const sites = ref<SiteItem[]>([]);
const selectedKeywords = ref<KeywordEntryItem[]>([]);
const selectedKeywordIds = computed(() => selectedKeywords.value.map((row) => row.id));
const keywordTableRef = ref<InstanceType<typeof KeywordPoolTable>>();
const creatingJobId = ref<string | null>(null);
const deleting = ref(false);
const deletingId = ref<string | null>(null);

const formDialogVisible = ref(false);
const importDialogVisible = ref(false);
const gscImportDialogVisible = ref(false);
const gscDiscoveredLoading = ref(false);
const importingGsc = ref(false);
const gscDiscoveredQueries = ref<GscDiscoveredQuery[]>([]);
const selectedGscDiscovered = ref<GscDiscoveredQuery[]>([]);
const batchJobDialogVisible = ref(false);
const assignClusterDialogVisible = ref(false);
const editingId = ref("");
const importText = ref("");
const formDialogRef = ref<InstanceType<typeof KeywordFormDialog>>();
const batchQuotaPreviewText = computed(() => quotaPreview.previewText(selectedKeywords.value.length));
const batchQuotaCanConsume = computed(() => quotaPreview.canConsume(selectedKeywords.value.length));

const form = reactive({
  keyword: "",
  intent: "INFORMATIONAL",
  businessValueScore: 0.5,
  contentFitScore: 0.5,
  notes: "",
  clusterId: "" as string | undefined
});

const formRules: FormRules = {
  keyword: [
    { required: true, message: "请输入关键词", trigger: "blur" },
    { min: 2, message: "至少 2 个字符", trigger: "blur" }
  ],
  intent: [{ required: true, message: "请选择意图", trigger: "change" }]
};

const batchJobForm = reactive({
  siteId: ""
});

const seedDialogUiRef = ref<InstanceType<typeof KeywordSeedDialog>>();

function notifySummaryRefresh() {
  emit("refreshSummary");
  void schedulingCtx?.refreshSummary();
}

const {
  visible: seedDialogVisible,
  fromGsc: seedFromGsc,
  step: seedStep,
  candidates: seedCandidates,
  selectedCandidates: selectedSeedCandidates,
  generating: generatingSeeds,
  confirming: confirmingSeeds,
  sitesLoading: seedSitesLoading,
  sites: seedSites,
  form: seedForm,
  reset: resetSeedDialog,
  open: openSeedDialog,
  openFromGscQueries,
  handleSelectionChange: handleSeedSelectionChange,
  submitPreview: submitPreviewSeeds,
  submitConfirm: submitConfirmSeeds,
  goBackToConfig: goBackSeedDialog
} = useKeywordSeedDialog(projectId, async () => {
  await fetchKeywords();
  notifySummaryRefresh();
}, seedDialogUiRef);

function clearSelection() {
  keywordTableRef.value?.clearSelection();
  selectedKeywords.value = [];
}

function handleSelectionChange(rows: KeywordEntryItem[]) {
  selectedKeywords.value = rows;
}

async function openGscImportDialog() {
  gscImportDialogVisible.value = true;
  gscDiscoveredLoading.value = true;
  selectedGscDiscovered.value = [];
  try {
    gscDiscoveredQueries.value = await listGscDiscoveredQueries(projectId);
  } catch {
    gscDiscoveredQueries.value = [];
  } finally {
    gscDiscoveredLoading.value = false;
  }
}

function handleGscDiscoveredSelection(rows: GscDiscoveredQuery[]) {
  selectedGscDiscovered.value = rows;
}

async function submitGscImport() {
  if (selectedGscDiscovered.value.length === 0) return;
  importingGsc.value = true;
  try {
    const result = await importGscKeywords(projectId, {
      items: selectedGscDiscovered.value.map((row) => ({
        query: row.query,
        siteId: row.siteId || undefined
      }))
    });
    message(`已加入 ${result.created} 个关键词${result.skipped ? `，跳过 ${result.skipped} 个重复` : ""}`, {
      type: "success"
    });
    gscImportDialogVisible.value = false;
    notifySummaryRefresh();
    await fetchKeywords();
  } catch (error) {
    message(error instanceof Error ? error.message : "导入失败", { type: "error" });
  } finally {
    importingGsc.value = false;
  }
}

function openAssignClusterDialog() {
  if (selectedKeywords.value.length === 0) {
    message("请先勾选关键词", { type: "warning" });
    return;
  }
  assignClusterDialogVisible.value = true;
}

function onClusterAssigned() {
  clearSelection();
  void loadClusters();
  void fetchKeywords();
  notifySummaryRefresh();
}

function resetForm() {
  form.keyword = "";
  form.intent = "INFORMATIONAL";
  form.businessValueScore = 0.5;
  form.contentFitScore = 0.5;
  form.notes = "";
  form.clusterId = undefined;
}

function openCreateDialog() {
  editingId.value = "";
  resetForm();
  formDialogVisible.value = true;
}

function openEditDialog(row: KeywordEntryItem) {
  editingId.value = row.id;
  form.keyword = row.keyword;
  form.intent = row.intent;
  form.businessValueScore = row.businessValueScore;
  form.contentFitScore = row.contentFitScore;
  form.notes = row.notes ?? "";
  form.clusterId = row.clusterId ?? undefined;
  formDialogVisible.value = true;
}

function openImportDialog() {
  importText.value = "";
  importDialogVisible.value = true;
}

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
  } finally {
    sitesLoading.value = false;
  }
}

function expandKeywordFromGsc(row: KeywordEntryItem) {
  void openSeedDialog({
    topicHint: buildGscSeedTopicHint([row.keyword]),
    siteId: row.siteId ?? undefined,
    fromGsc: true
  });
}

function expandGscSelectionToSeeds() {
  if (selectedGscDiscovered.value.length === 0) return;
  const queries = selectedGscDiscovered.value.map((row) => row.query).slice(0, 3);
  const siteId = selectedGscDiscovered.value[0]?.siteId;
  gscImportDialogVisible.value = false;
  void openFromGscQueries(queries, siteId || undefined);
}

function openSeedDialogFromRoute() {
  const seedTopic = route.query.seedTopic;
  if (typeof seedTopic !== "string" || !seedTopic.trim()) return;
  const seedSiteId = route.query.seedSiteId;
  void openSeedDialog({
    topicHint: buildGscSeedTopicHint([seedTopic.trim()]),
    siteId: typeof seedSiteId === "string" ? seedSiteId : undefined,
    fromGsc: true
  });
}

function parseImportLines(text: string): CreateKeywordPayload[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((part) => part.trim());
      const keyword = parts[0];
      const clusterName = parts[1]?.trim() || undefined;
      return { keyword, clusterName };
    })
    .filter((item) => item.keyword.length >= 2);
}

async function submitForm() {
  const valid = await formDialogRef.value?.validate();
  if (!valid) return;

  saving.value = true;
  try {
    const payload: CreateKeywordPayload = {
      keyword: form.keyword.trim(),
      intent: form.intent,
      businessValueScore: form.businessValueScore,
      contentFitScore: form.contentFitScore,
      notes: form.notes.trim() || undefined,
      clusterId: form.clusterId || undefined
    };

    if (editingId.value) {
      await updateKeyword(projectId, editingId.value, {
        intent: payload.intent,
        businessValueScore: payload.businessValueScore,
        contentFitScore: payload.contentFitScore,
        notes: payload.notes ?? null,
        clusterId: form.clusterId || null
      });
      message("关键词已更新", { type: "success" });
    } else {
      await createKeyword(projectId, payload);
      message("关键词已添加", { type: "success" });
    }

    formDialogVisible.value = false;
    await fetchKeywords();
    notifySummaryRefresh();
  } finally {
    saving.value = false;
  }
}

async function submitImport() {
  const items = parseImportLines(importText.value);
  if (items.length === 0) {
    message("请至少输入一行有效关键词", { type: "warning" });
    return;
  }

  importing.value = true;
  try {
    const result = await importKeywords(projectId, items);
    message(`导入完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`, {
      type: "success"
    });
    importDialogVisible.value = false;
    await fetchKeywords();
    notifySummaryRefresh();
  } finally {
    importing.value = false;
  }
}


async function confirmDelete(count: number, keyword?: string, hasUsed = false) {
  const subject = count === 1 && keyword ? `「${keyword}」` : `${count} 个关键词`;
  let text = `${subject}将从关键词池永久删除，不可恢复。`;
  if (hasUsed) {
    text += " 已关联的文章任务不会被删除。";
  }
  await ElMessageBox.confirm(text, "删除关键词", {
    type: "warning",
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    confirmButtonClass: "el-button--danger"
  });
}

async function deleteKeywordRows(rows: KeywordEntryItem[]) {
  if (rows.length === 0) {
    message("请先选择关键词", { type: "warning" });
    return;
  }

  const hasUsed = rows.some((row) => row.status === "USED" || row.lastJobId);
  await confirmDelete(
    rows.length,
    rows.length === 1 ? rows[0].keyword : undefined,
    hasUsed
  );

  if (rows.length === 1) {
    deletingId.value = rows[0].id;
  } else {
    deleting.value = true;
  }

  try {
    if (rows.length === 1) {
      await deleteKeyword(projectId, rows[0].id);
    } else {
      await deleteKeywords(projectId, { ids: rows.map((row) => row.id) });
    }
    message(`已删除 ${rows.length} 个关键词`, { type: "success" });
    clearSelection();
    await fetchKeywords();
    notifySummaryRefresh();
  } finally {
    deleting.value = false;
    deletingId.value = null;
  }
}

async function handleDelete(row: KeywordEntryItem) {
  try {
    await deleteKeywordRows([row]);
  } catch (error) {
    if (error === "cancel") return;
    throw error;
  }
}

async function handleBatchDelete() {
  try {
    await deleteKeywordRows(selectedKeywords.value);
  } catch (error) {
    if (error === "cancel") return;
    throw error;
  }
}

async function confirmKeywordConflicts(siteId: string, keyword: string): Promise<boolean> {
  try {
    const conflicts = await getSiteKeywordConflicts(projectId, siteId, keyword);
    if (conflicts.length === 0) return true;
    await ElMessageBox.confirm(
      `「${keyword}」与已有任务「${conflicts[0].keyword}」过于相似，继续入队可能导致内容同质化。是否仍要提交？`,
      "关键词冲突提示",
      { type: "warning", confirmButtonText: "仍要入队", cancelButtonText: "取消" }
    );
    return true;
  } catch (error) {
    if (error === "cancel") return false;
    return true;
  }
}

async function handleCreateJob(row: KeywordEntryItem) {
  const siteId = row.siteId ?? batchJobForm.siteId ?? sites.value[0]?.id;
  if (siteId && !(await confirmKeywordConflicts(siteId, row.keyword))) return;

  creatingJobId.value = row.id;
  try {
    const result = await createJobFromKeyword(projectId, row.id, siteId);
    message("任务已创建", { type: "success" });
    if (result.warnings?.length) {
      message(result.warnings[0].message, { type: "warning" });
    }
    await fetchKeywords();
    notifySummaryRefresh();
    router.push({
      name: "SeoFactoryJobDetail",
      params: { projectId, jobId: result.job.id }
    });
  } finally {
    creatingJobId.value = null;
  }
}

function openBatchJobDialog() {
  if (selectedKeywords.value.length === 0) {
    message("请先勾选关键词", { type: "warning" });
    return;
  }
  batchJobForm.siteId = sites.value[0]?.id ?? "";
  batchJobDialogVisible.value = true;
  void quotaPreview.refreshQuota();
  if (sites.value.length === 0) {
    void loadSites();
  }
}

async function submitBatchCreateJobs() {
  if (selectedKeywords.value.length === 0) return;
  if (!quotaPreview.canConsume(selectedKeywords.value.length)) {
    message("本账期配额不足", { type: "warning" });
    return;
  }

  const siteId = batchJobForm.siteId || undefined;
  if (siteId) {
    for (const row of selectedKeywords.value.slice(0, 5)) {
      if (!(await confirmKeywordConflicts(siteId, row.keyword))) return;
    }
  }

  batchCreating.value = true;
  try {
    const result = await createJobsFromKeywords(projectId, {
      ids: selectedKeywords.value.map((row) => row.id),
      siteId: batchJobForm.siteId || undefined
    });

    const skippedText = result.skipped > 0 ? `，跳过 ${result.skipped} 个已归档` : "";
    message(`已创建 ${result.created} 个任务${skippedText}`, { type: "success" });
    batchJobDialogVisible.value = false;
    clearSelection();
    await fetchKeywords();
    notifySummaryRefresh();

    if (result.jobs.length === 1) {
      router.push({
        name: "SeoFactoryJobDetail",
        params: { projectId, jobId: result.jobs[0].job.id }
      });
    } else if (result.jobs.length > 1) {
      router.push({ name: "SeoFactoryJobs", params: { projectId } });
    }
  } finally {
    batchCreating.value = false;
  }
}

function goJobDetail(jobId: string) {
  router.push({ name: "SeoFactoryJobDetail", params: { projectId, jobId } });
}

onMounted(() => {
  if (route.query.gscImport === "1" || route.query.gscImport === "true") {
    void openGscImportDialog();
  } else {
    openSeedDialogFromRoute();
  }
});

watch(
  () => [route.query.seedTopic, route.query.seedSiteId],
  () => {
    if (route.query.gscImport === "1" || route.query.gscImport === "true") return;
    openSeedDialogFromRoute();
  }
);
</script>
