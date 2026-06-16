<!--
  关键词池：发现、优先级排序与一键入队。

  边界：
  - 不负责：Semrush RPA 写作助手检测
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">关键词池</span>
          <div class="flex flex-wrap gap-2">
            <el-button v-if="isAdmin" type="warning" :loading="generatingSeeds" @click="openSeedDialog">
              AI 生成种子词
            </el-button>
            <el-button v-if="isAdmin" :loading="enrichingMetrics" @click="handleEnrichMetrics">
              回填 Semrush 指标
            </el-button>
            <el-button v-if="isAdmin" type="primary" @click="openCreateDialog">添加关键词</el-button>
            <el-button v-if="isAdmin" @click="openImportDialog">批量导入</el-button>
            <el-button
              type="primary"
              :disabled="selectedKeywords.length === 0"
              :loading="batchCreating"
              @click="openBatchJobDialog"
            >
              批量入队{{ selectedKeywords.length > 0 ? `（${selectedKeywords.length}）` : "" }}
            </el-button>
            <el-button @click="fetchKeywords">刷新</el-button>
            <el-button link type="primary" @click="goTopicClusters">主题集群</el-button>
          </div>
        </div>
      </template>

      <el-collapse class="mb-4">
        <el-collapse-item title="优先级怎么算？（管理员）" name="priority">
          <p class="text-sm leading-relaxed text-gray-600">
            优先级 = 搜索量 25% + 商业价值 35% + 难度（越低越好）20% + 内容匹配 20%。
            管理员可点击「回填搜索指标」拉取 Semrush 数据。导入 CSV 可选第四列「主题名称」。
          </p>
        </el-collapse-item>
      </el-collapse>

      <div v-if="filterClusterId || quickFilter !== 'all'" class="mb-4">
        <el-alert type="info" :closable="false" show-icon :title="activeFilterTitle">
          <template #default>
            <el-button link type="primary" @click="clearAllFilters">查看全部关键词</el-button>
          </template>
        </el-alert>
      </div>

      <div v-if="selectedKeywords.length" class="mb-4 flex flex-wrap items-center gap-2">
        <span class="text-sm text-gray-600">已选 {{ selectedKeywords.length }} 项</span>
        <el-button v-if="isAdmin" size="small" @click="openAssignClusterDialog">归入主题</el-button>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <el-radio-group v-model="quickFilter" @change="onQuickFilterChange">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="queueable">可入队</el-radio-button>
          <el-radio-button value="unclustered">未分组</el-radio-button>
        </el-radio-group>
        <el-select v-model="filterStatus" clearable placeholder="状态" style="width: 140px" @change="onFilterChange">
          <el-option
            v-for="item in keywordStatusDict"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select v-model="filterIntent" clearable placeholder="意图" style="width: 140px" @change="onFilterChange">
          <el-option
            v-for="item in keywordIntentDict"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select
          v-model="filterClusterId"
          clearable
          placeholder="主题"
          style="width: 160px"
          @change="onClusterFilterChange"
        >
          <el-option
            v-for="item in clusters"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="keywords"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="48" :selectable="isRowSelectable" />
        <el-table-column prop="keyword" label="关键词" min-width="180" show-overflow-tooltip />
        <el-table-column prop="priorityScore" label="优先级" width="90" sortable>
          <template #default="{ row }">
            <el-tag :type="priorityTagType(row.priorityScore)" size="small">
              {{ formatScore(row.priorityScore) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="intent" label="意图" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="dictTagType(keywordIntentDict, row.intent)">
              {{ dictLabel(keywordIntentDict, row.intent) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="主题" width="130" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.cluster?.name">{{ row.cluster.name }}</span>
            <span v-else class="text-gray-400">未分组</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="dictTagType(keywordStatusDict, row.status)">
              {{ dictLabel(keywordStatusDict, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="searchVolume" label="搜索量" width="90">
          <template #default="{ row }">
            {{ row.searchVolume ?? "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="keywordDifficulty" label="KD" width="70">
          <template #default="{ row }">
            {{ row.keywordDifficulty ?? "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="100">
          <template #default="{ row }">
            {{ dictLabel(keywordSourceDict, row.source) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status !== 'ARCHIVED' && row.status !== 'USED'"
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
            <el-button
              v-if="isAdmin && row.status === 'PENDING'"
              type="success"
              link
              @click="handleApprove(row as KeywordEntryItem)"
            >
              通过
            </el-button>
            <el-button
              v-if="isAdmin"
              type="primary"
              link
              @click="openEditDialog(row as KeywordEntryItem)"
            >
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="fetchKeywords"
          @size-change="onSizeChange"
        />
      </div>

      <el-empty v-if="!loading && keywords.length === 0" :description="emptyKeywordHint" />
    </el-card>

    <el-dialog
      v-model="formDialogVisible"
      :title="editingId ? '编辑关键词' : '添加关键词'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="关键词" prop="keyword">
          <el-input v-model="form.keyword" :disabled="Boolean(editingId)" maxlength="200" />
        </el-form-item>
        <el-form-item label="搜索意图" prop="intent">
          <el-select v-model="form.intent" class="w-full">
            <el-option
              v-for="item in keywordIntentDict"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="所属主题">
          <el-select v-model="form.clusterId" class="w-full" clearable placeholder="未分组">
            <el-option
              v-for="item in clusters"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索量">
          <el-input-number v-model="form.searchVolume" :min="0" class="w-full" />
        </el-form-item>
        <el-form-item label="KD (0-100)">
          <el-input-number v-model="form.keywordDifficulty" :min="0" :max="100" class="w-full" />
        </el-form-item>
        <el-form-item label="商业价值">
          <el-slider v-model="form.businessValueScore" :min="0" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="内容匹配">
          <el-slider v-model="form.contentFitScore" :min="0" :max="1" :step="0.05" show-input />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="2000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="seedDialogVisible" title="AI 生成种子关键词" width="560px" destroy-on-close>
      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="说明"
        description="基于站点域名、品牌语气与目标市场，由 AI 生成一批待筛选关键词并写入关键词池。"
      />
      <el-form label-width="100px">
        <el-form-item label="目标站点">
          <el-select v-model="seedForm.siteId" class="w-full" placeholder="默认首个站点" clearable :loading="sitesLoading">
            <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input-number v-model="seedForm.count" :min="5" :max="30" class="w-full" />
        </el-form-item>
        <el-form-item label="主题聚焦">
          <el-input
            v-model="seedForm.topicHint"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可选，如：工业阀门、B2B 采购决策"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="seedDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="generatingSeeds" @click="submitGenerateSeeds">开始生成</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchJobDialogVisible" title="批量创建文章任务" width="520px" destroy-on-close>
      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="说明"
        description="将为所选关键词各创建一个生成任务；已归档关键词会被跳过。入队前会校验本月文章配额。"
      />
      <el-form label-width="100px">
        <el-form-item label="已选关键词">
          <span>{{ selectedKeywords.length }} 个</span>
        </el-form-item>
        <el-form-item label="目标站点">
          <el-select
            v-model="batchJobForm.siteId"
            class="w-full"
            placeholder="默认各关键词绑定站点或首个站点"
            clearable
            :loading="sitesLoading"
          >
            <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchJobDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchCreating" @click="submitBatchCreateJobs">
          确认入队
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialogVisible" title="批量导入关键词" width="560px" destroy-on-close>
      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="格式"
        description="每行一个关键词；可选附加列：搜索量,KD,主题名称（逗号分隔）。"
      />
      <el-input
        v-model="importText"
        type="textarea"
        :rows="10"
        placeholder="industrial valve supplier&#10;stainless steel ball valve,800,42,工业阀门选型"
      />
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="submitImport">导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="assignClusterDialogVisible" title="归入主题" width="420px">
      <el-select v-model="assignClusterId" class="w-full" placeholder="选择主题">
        <el-option v-for="item in clusters" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <template #footer>
        <el-button @click="assignClusterDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="assigningCluster" @click="submitAssignCluster">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules, TableInstance } from "element-plus";
import {
  assignKeywordsToCluster,
  listKeywordClusters,
  type KeywordClusterItem
} from "@/api/seo-factory/keyword-cluster";
import {
  createJobFromKeyword,
  createJobsFromKeywords,
  createKeyword,
  enrichKeywordMetrics,
  generateKeywordSeeds,
  importKeywords,
  listKeywords,
  updateKeyword,
  type CreateKeywordPayload,
  type KeywordEntryItem
} from "@/api/seo-factory/keyword";
import { listSites } from "@/api/seo-factory/site";
import { getSiteKeywordConflicts } from "@/api/seo-factory/keyword-conflict";
import type { SiteItem } from "@/api/seo-factory/types";
import { ElMessageBox } from "element-plus";
import {
  keywordIntentDict,
  keywordSourceDict,
  keywordStatusDict
} from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";
import { useUserStoreHook } from "@/store/modules/user";

defineOptions({ name: "KeywordPoolView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const userStore = useUserStoreHook();
const isAdmin = computed(() => userStore.roles.includes("admin"));

const emptyKeywordHint = computed(() =>
  isAdmin.value
    ? "暂无关键词，请添加或批量导入"
    : "暂无关键词，请联系管理员导入；您可勾选后批量创建任务"
);

const activeFilterTitle = computed(() => {
  const parts: string[] = [];
  if (quickFilter.value === "queueable") parts.push("可入队");
  if (quickFilter.value === "unclustered") parts.push("未分组");
  if (filterClusterId.value) {
    const name = clusters.value.find((c) => c.id === filterClusterId.value)?.name;
    if (name) parts.push(`主题「${name}」`);
  }
  return parts.length ? `筛选：${parts.join(" · ")}` : "筛选中";
});

const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const generatingSeeds = ref(false);
const enrichingMetrics = ref(false);
const batchCreating = ref(false);
const sitesLoading = ref(false);
const sites = ref<SiteItem[]>([]);
const keywords = ref<KeywordEntryItem[]>([]);
const selectedKeywords = ref<KeywordEntryItem[]>([]);
const tableRef = ref<TableInstance>();
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const filterStatus = ref("");
const filterIntent = ref("");
const filterClusterId = ref("");
const quickFilter = ref<"all" | "queueable" | "unclustered">("all");
const clusters = ref<KeywordClusterItem[]>([]);
const creatingJobId = ref<string | null>(null);

const formDialogVisible = ref(false);
const importDialogVisible = ref(false);
const batchJobDialogVisible = ref(false);
const seedDialogVisible = ref(false);
const assignClusterDialogVisible = ref(false);
const assigningCluster = ref(false);
const assignClusterId = ref("");
const editingId = ref("");
const importText = ref("");
const formRef = ref<FormInstance>();

const form = reactive({
  keyword: "",
  intent: "INFORMATIONAL",
  searchVolume: undefined as number | undefined,
  keywordDifficulty: undefined as number | undefined,
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

const seedForm = reactive({
  siteId: "",
  count: 15,
  topicHint: ""
});

const batchJobForm = reactive({
  siteId: ""
});

function isRowSelectable(row: KeywordEntryItem) {
  return row.status !== "ARCHIVED";
}

function handleSelectionChange(rows: KeywordEntryItem[]) {
  selectedKeywords.value = rows;
}

function clearSelection() {
  tableRef.value?.clearSelection();
  selectedKeywords.value = [];
}

function formatScore(value: number) {
  return Number(value ?? 0).toFixed(1);
}

function priorityTagType(score: number) {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "info";
}

async function fetchKeywords() {
  loading.value = true;
  try {
    const res = await listKeywords(projectId, page.value, limit.value, {
      status: quickFilter.value === "queueable" ? undefined : filterStatus.value || undefined,
      intent: filterIntent.value || undefined,
      clusterId: filterClusterId.value || undefined,
      unclustered: quickFilter.value === "unclustered",
      queueable: quickFilter.value === "queueable"
    });
    keywords.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? keywords.value.length;
  } finally {
    loading.value = false;
  }
}

function onQuickFilterChange() {
  if (quickFilter.value === "queueable") {
    filterStatus.value = "";
  }
  page.value = 1;
  syncFiltersToRoute();
  void fetchKeywords();
}

function onFilterChange() {
  page.value = 1;
  void fetchKeywords();
}

function syncFiltersToRoute() {
  const query: Record<string, string> = {};
  if (filterClusterId.value) query.clusterId = filterClusterId.value;
  if (quickFilter.value === "queueable") query.queueable = "1";
  if (quickFilter.value === "unclustered") query.unclustered = "1";
  router.replace({ name: "SeoFactoryKeywords", params: { projectId }, query });
}

function onClusterFilterChange() {
  page.value = 1;
  syncFiltersToRoute();
  void fetchKeywords();
}

function clearAllFilters() {
  quickFilter.value = "all";
  filterClusterId.value = "";
  filterStatus.value = "";
  filterIntent.value = "";
  page.value = 1;
  router.replace({ name: "SeoFactoryKeywords", params: { projectId } });
  void fetchKeywords();
}

function clearClusterFilter() {
  filterClusterId.value = "";
  onClusterFilterChange();
}

async function loadClusters() {
  clusters.value = await listKeywordClusters(projectId);
}

function goTopicClusters() {
  router.push({ name: "SeoFactoryTopicClusters", params: { projectId } });
}

function openAssignClusterDialog() {
  if (clusters.value.length === 0) {
    message("请先在「主题集群」创建主题", { type: "warning" });
    return;
  }
  assignClusterId.value = clusters.value[0]?.id ?? "";
  assignClusterDialogVisible.value = true;
}

async function submitAssignCluster() {
  if (!assignClusterId.value || selectedKeywords.value.length === 0) return;
  assigningCluster.value = true;
  try {
    const result = await assignKeywordsToCluster(
      projectId,
      assignClusterId.value,
      selectedKeywords.value.map((row) => row.id)
    );
    message(`已归入主题：${result.assigned} 个关键词`, { type: "success" });
    assignClusterDialogVisible.value = false;
    clearSelection();
    await fetchKeywords();
    await loadClusters();
  } finally {
    assigningCluster.value = false;
  }
}

function syncClusterFilterFromRoute() {
  const clusterId = route.query.clusterId;
  filterClusterId.value = typeof clusterId === "string" ? clusterId : "";
  if (route.query.queueable === "1" || route.query.queueable === "true") {
    quickFilter.value = "queueable";
  } else if (route.query.unclustered === "1" || route.query.unclustered === "true") {
    quickFilter.value = "unclustered";
  } else {
    quickFilter.value = "all";
  }
}

function onSizeChange() {
  page.value = 1;
  void fetchKeywords();
}

function resetForm() {
  form.keyword = "";
  form.intent = "INFORMATIONAL";
  form.searchVolume = undefined;
  form.keywordDifficulty = undefined;
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
  form.searchVolume = row.searchVolume ?? undefined;
  form.keywordDifficulty = row.keywordDifficulty ?? undefined;
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

function openSeedDialog() {
  seedForm.siteId = sites.value[0]?.id ?? "";
  seedForm.count = 15;
  seedForm.topicHint = "";
  seedDialogVisible.value = true;
  if (sites.value.length === 0) {
    void loadSites();
  }
}

async function submitGenerateSeeds() {
  generatingSeeds.value = true;
  try {
    const result = await generateKeywordSeeds(projectId, {
      siteId: seedForm.siteId || undefined,
      count: seedForm.count,
      topicHint: seedForm.topicHint.trim() || undefined
    });
    message(`种子词生成完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`, {
      type: "success"
    });
    seedDialogVisible.value = false;
    await fetchKeywords();
  } finally {
    generatingSeeds.value = false;
  }
}

async function handleEnrichMetrics() {
  enrichingMetrics.value = true;
  try {
    const result = await enrichKeywordMetrics(projectId, { allMissing: true });
    message(`指标回填完成：更新 ${result.updated} 条`, { type: "success" });
    await fetchKeywords();
  } finally {
    enrichingMetrics.value = false;
  }
}

function parseImportLines(text: string): CreateKeywordPayload[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((part) => part.trim());
      const keyword = parts[0];
      const searchVolume = parts[1] ? Number(parts[1]) : undefined;
      const keywordDifficulty = parts[2] ? Number(parts[2]) : undefined;
      const clusterName = parts[3]?.trim() || undefined;
      return {
        keyword,
        searchVolume: Number.isFinite(searchVolume) ? searchVolume : undefined,
        keywordDifficulty: Number.isFinite(keywordDifficulty) ? keywordDifficulty : undefined,
        clusterName
      };
    })
    .filter((item) => item.keyword.length >= 2);
}

async function submitForm() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    saving.value = true;
    try {
      const payload: CreateKeywordPayload = {
        keyword: form.keyword.trim(),
        intent: form.intent,
        searchVolume: form.searchVolume,
        keywordDifficulty: form.keywordDifficulty,
        businessValueScore: form.businessValueScore,
        contentFitScore: form.contentFitScore,
        notes: form.notes.trim() || undefined,
        clusterId: form.clusterId || undefined
      };

      if (editingId.value) {
        await updateKeyword(projectId, editingId.value, {
          intent: payload.intent,
          searchVolume: payload.searchVolume ?? null,
          keywordDifficulty: payload.keywordDifficulty ?? null,
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
    } finally {
      saving.value = false;
    }
  });
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
  } finally {
    importing.value = false;
  }
}

async function handleApprove(row: KeywordEntryItem) {
  await updateKeyword(projectId, row.id, { status: "APPROVED" });
  message("已标记为通过", { type: "success" });
  await fetchKeywords();
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
    message("任务已入队", { type: "success" });
    if (result.warnings?.length) {
      message(result.warnings[0].message, { type: "warning" });
    }
    await fetchKeywords();
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
  if (sites.value.length === 0) {
    void loadSites();
  }
}

async function submitBatchCreateJobs() {
  if (selectedKeywords.value.length === 0) return;

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
    message(`已入队 ${result.created} 个任务${skippedText}`, { type: "success" });
    batchJobDialogVisible.value = false;
    clearSelection();
    await fetchKeywords();

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
  syncClusterFilterFromRoute();
  void loadClusters();
  void fetchKeywords();
});

watch(
  () => [route.query.clusterId, route.query.queueable, route.query.unclustered],
  () => {
    syncClusterFilterFromRoute();
    page.value = 1;
    void fetchKeywords();
  }
);
</script>
