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
        <el-form-item label="所属专题">
          <el-select v-model="form.clusterId" class="w-full" clearable placeholder="未分组">
            <el-option
              v-for="item in clusters"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
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

    <el-dialog
      v-model="seedDialogVisible"
      :title="seedStep === 'config' ? 'AI 生成种子词' : '挑选要加入的关键词'"
      width="820px"
      destroy-on-close
      class="keyword-seed-dialog"
      :class="{ 'is-preview': seedStep === 'preview' }"
      @closed="resetSeedDialog"
    >
      <template v-if="seedStep === 'config'">
        <el-alert
          v-if="seedFromGsc"
          class="mb-4"
          type="success"
          :closable="false"
          show-icon
          title="已带入本站 Google 搜索词"
          description="AI 将围绕该站点真实搜索词扩展相关长尾选题；预览后勾选加入词库。"
        />
        <el-collapse class="mb-4">
          <el-collapse-item title="这个功能是做什么的？" name="principle">
            <div class="space-y-2 text-sm leading-relaxed text-gray-600">
              <p>
                <strong>种子词</strong>是内容规划的起点：AI 根据站点域名、品牌语气、目标市场和你填的「主题聚焦」，模拟 SEO 研究员头脑风暴，生成一批<strong>候选搜索词</strong>。
              </p>
              <p>
                每个候选词会附带<strong>搜索意图</strong>、<strong>商业价值</strong>与<strong>内容匹配度</strong>评估，用于后续「建议优先级」排序——并不是直接写文章。
              </p>
              <p>
                生成后你会在下一步<strong>勾选想要的词</strong>，确认后才写入关键词池；不合适的可以去掉，不会自动全部入库。
              </p>
              <p class="text-gray-500">
                推荐路径：生成并挑选 → 加入专题 → 按主题创建任务。
              </p>
            </div>
          </el-collapse-item>
        </el-collapse>
        <el-form label-width="100px">
          <el-form-item label="目标站点">
            <el-select v-model="seedForm.siteId" class="w-full" placeholder="默认首个站点" clearable :loading="sitesLoading">
              <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="生成数量">
            <el-input-number v-model="seedForm.count" :min="5" :max="30" class="w-full" />
          </el-form-item>
          <el-form-item :label="seedFromGsc ? '搜索锚点' : '主题聚焦'">
            <el-input
              v-model="seedForm.topicHint"
              type="textarea"
              :rows="3"
              maxlength="500"
              show-word-limit
              :placeholder="
                seedFromGsc
                  ? '来自本站 Google 搜索数据，可微调后生成'
                  : '可选，如：工业阀门、B2B 采购决策'
              "
            />
          </el-form-item>
        </el-form>
      </template>

      <div v-else class="keyword-seed-preview">
        <el-alert
          class="mb-4"
          type="info"
          :closable="false"
          show-icon
          title="请勾选要加入关键词池的词"
          description="已存在于池中的词会标记为「已有」，无法重复加入。确认后仅写入你勾选的项。"
        />
        <el-table
          ref="seedPreviewTableRef"
          class="keyword-seed-preview__table"
          :data="seedCandidates"
          :max-height="380"
          stripe
          @selection-change="handleSeedSelectionChange"
        >
          <el-table-column type="selection" width="48" :selectable="isSeedRowSelectable" />
          <el-table-column prop="keyword" label="关键词" min-width="220" show-overflow-tooltip />
          <el-table-column label="建议优先级" width="108">
            <template #default="{ row }">
              <el-tag :type="priorityTierTagType(seedPriorityScore(row))" size="small">
                {{ priorityTierLabel(seedPriorityScore(row)) }}
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
          <el-table-column prop="rationale" label="推荐理由" min-width="280" show-overflow-tooltip />
          <el-table-column label="状态" width="72">
            <template #default="{ row }">
              <el-tag v-if="row.alreadyExists" size="small" type="info">已有</el-tag>
              <span v-else class="text-gray-400">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <template v-if="seedStep === 'config'">
          <el-button @click="seedDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="generatingSeeds" @click="submitPreviewSeeds">生成预览</el-button>
        </template>
        <template v-else>
          <el-button @click="seedStep = 'config'">返回修改</el-button>
          <el-button @click="seedDialogVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="confirmingSeeds"
            :disabled="selectedSeedCandidates.length === 0"
            @click="submitConfirmSeeds"
          >
            加入关键词池{{ selectedSeedCandidates.length > 0 ? `（${selectedSeedCandidates.length}）` : "" }}
          </el-button>
        </template>
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
        <el-form-item label="配额">
          <span>{{ quotaPreview.previewText(selectedKeywords.length) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchJobDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="batchCreating"
          :disabled="!quotaPreview.canConsume(selectedKeywords.length)"
          @click="submitBatchCreateJobs"
        >
          确认创建
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
        description="每行一个关键词；可选第二列：专题名称（逗号分隔）。"
      />
      <el-input
        v-model="importText"
        type="textarea"
        :rows="10"
        placeholder="industrial valve supplier&#10;stainless steel ball valve,工业阀门选型"
      />
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="submitImport">导入</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="gscImportDialogVisible"
      title="加入本站 Google 搜索词"
      width="640px"
      destroy-on-close
    >
      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="站点在 Google 已有搜索曝光，词库尚未收录"
        description="以下为您站点在 Google 搜索控制台中的真实搜索词（已获得展示），尚未加入词库。可勾选加入选题，或用 AI 扩展相关长尾词。"
      />
      <el-table
        v-loading="gscDiscoveredLoading"
        :data="gscDiscoveredQueries"
        size="small"
        stripe
        max-height="320"
        @selection-change="handleGscDiscoveredSelection"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="query" label="搜索词" min-width="160" show-overflow-tooltip />
        <el-table-column prop="siteDomain" label="站点" width="120" show-overflow-tooltip />
        <el-table-column prop="impressions" label="展示" width="72" />
        <el-table-column prop="clicks" label="点击" width="72" />
        <el-table-column label="排名" width="72">
          <template #default="{ row }">{{ row.position.toFixed(1) }}</template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!gscDiscoveredLoading && gscDiscoveredQueries.length === 0"
        description="暂无新搜索词；请先在「站点详情 → 搜索表现」同步数据"
      />
      <template #footer>
        <el-button @click="gscImportDialogVisible = false">取消</el-button>
        <el-button
          :disabled="selectedGscDiscovered.length === 0"
          @click="expandGscSelectionToSeeds"
        >
          AI 扩展相关词
        </el-button>
        <el-button
          type="primary"
          :loading="importingGsc"
          :disabled="selectedGscDiscovered.length === 0"
          @click="submitGscImport"
        >
          加入词库{{ selectedGscDiscovered.length > 0 ? `（${selectedGscDiscovered.length}）` : "" }}
        </el-button>
      </template>
    </el-dialog>

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
import { computed, inject, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules, TableInstance } from "element-plus";
import {
  createJobFromKeyword,
  createJobsFromKeywords,
  createKeyword,
  deleteKeyword,
  deleteKeywords,
  confirmKeywordSeeds,
  previewKeywordSeeds,
  type KeywordSeedCandidate,
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
import {
  keywordIntentDict
} from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import {
  getKeywordPriorityTier,
  getKeywordPriorityTierLabel,
  getKeywordPriorityTierTagType
} from "@/utils/seo-factory/keyword-display";
import {
  buildGscSeedTopicHint
} from "@/utils/seo-factory/gsc-keyword-display";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useKeywordPoolData } from "@/composables/seo-factory/useKeywordPoolData";
import { useArticleQuotaPreview } from "@/composables/useArticleQuotaPreview";
import { keywordSchedulingContextKey } from "@/composables/seo-factory/keyword-scheduling-context";
import KeywordClusterAssignDialog from "./components/KeywordClusterAssignDialog.vue";
import KeywordPoolFilters from "./components/KeywordPoolFilters.vue";
import KeywordPoolTable from "./components/KeywordPoolTable.vue";

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
const generatingSeeds = ref(false);
const confirmingSeeds = ref(false);
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
const seedDialogVisible = ref(false);
const seedFromGsc = ref(false);
const seedStep = ref<"config" | "preview">("config");
const seedCandidates = ref<KeywordSeedCandidate[]>([]);
const selectedSeedCandidates = ref<KeywordSeedCandidate[]>([]);
const seedPreviewSiteId = ref("");
const seedPreviewTableRef = ref<TableInstance>();
const assignClusterDialogVisible = ref(false);
const editingId = ref("");
const importText = ref("");
const formRef = ref<FormInstance>();

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

const seedForm = reactive({
  siteId: "",
  count: 15,
  topicHint: ""
});

const batchJobForm = reactive({
  siteId: ""
});

function clearSelection() {
  keywordTableRef.value?.clearSelection();
  selectedKeywords.value = [];
}

function handleSelectionChange(rows: KeywordEntryItem[]) {
  selectedKeywords.value = rows;
}

function notifySummaryRefresh() {
  emit("refreshSummary");
  void schedulingCtx?.refreshSummary();
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

function seedPriorityScore(row: {
  businessValueScore?: number;
  contentFitScore?: number;
}) {
  const raw = (row.businessValueScore ?? 0.5) * 0.5 + (row.contentFitScore ?? 0.5) * 0.5;
  return Math.round(raw * 1000) / 10;
}

function priorityTierLabel(score: number) {
  return getKeywordPriorityTierLabel(getKeywordPriorityTier(score));
}

function priorityTierTagType(score: number) {
  return getKeywordPriorityTierTagType(getKeywordPriorityTier(score));
}

function isSeedRowSelectable(row: KeywordSeedCandidate) {
  return !row.alreadyExists;
}

function handleSeedSelectionChange(rows: KeywordSeedCandidate[]) {
  selectedSeedCandidates.value = rows;
}

function resetSeedDialog() {
  seedStep.value = "config";
  seedCandidates.value = [];
  selectedSeedCandidates.value = [];
  seedPreviewSiteId.value = "";
  seedFromGsc.value = false;
}

function openSeedDialog(options?: {
  topicHint?: string;
  siteId?: string;
  fromGsc?: boolean;
}) {
  resetSeedDialog();
  seedForm.siteId = options?.siteId ?? sites.value[0]?.id ?? "";
  seedForm.count = 15;
  seedForm.topicHint = options?.topicHint ?? "";
  seedFromGsc.value = options?.fromGsc ?? false;
  seedDialogVisible.value = true;
  if (sites.value.length === 0) {
    void loadSites();
  }
}

function expandKeywordFromGsc(row: KeywordEntryItem) {
  openSeedDialog({
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
  openSeedDialog({
    topicHint: buildGscSeedTopicHint(queries),
    siteId: siteId || undefined,
    fromGsc: true
  });
}

function openSeedDialogFromRoute() {
  const seedTopic = route.query.seedTopic;
  if (typeof seedTopic !== "string" || !seedTopic.trim()) return;
  const seedSiteId = route.query.seedSiteId;
  openSeedDialog({
    topicHint: buildGscSeedTopicHint([seedTopic.trim()]),
    siteId: typeof seedSiteId === "string" ? seedSiteId : undefined,
    fromGsc: true
  });
}

async function submitPreviewSeeds() {
  generatingSeeds.value = true;
  try {
    const result = await previewKeywordSeeds(projectId, {
      siteId: seedForm.siteId || undefined,
      count: seedForm.count,
      topicHint: seedForm.topicHint.trim() || undefined
    });
    seedCandidates.value = result.keywords;
    seedPreviewSiteId.value = result.siteId;
    seedStep.value = "preview";
    await nextTick();
    const selectable = seedCandidates.value.filter((row) => !row.alreadyExists);
    selectedSeedCandidates.value = selectable;
    selectable.forEach((row) => {
      seedPreviewTableRef.value?.toggleRowSelection(row, true);
    });
    if (selectable.length === 0) {
      message("生成的词均已在关键词池中", { type: "warning" });
    }
  } finally {
    generatingSeeds.value = false;
  }
}

async function submitConfirmSeeds() {
  if (selectedSeedCandidates.value.length === 0) {
    message("请至少勾选一个关键词", { type: "warning" });
    return;
  }
  confirmingSeeds.value = true;
  try {
    const result = await confirmKeywordSeeds(projectId, {
      siteId: seedPreviewSiteId.value || seedForm.siteId || undefined,
      keywords: selectedSeedCandidates.value.map((row) => ({
        keyword: row.keyword,
        intent: row.intent,
        businessValueScore: row.businessValueScore,
        contentFitScore: row.contentFitScore,
        rationale: row.rationale
      }))
    });
    const skippedText = result.skipped > 0 ? `，跳过 ${result.skipped} 个重复` : "";
    message(`已加入 ${result.created} 个关键词${skippedText}`, { type: "success" });
    seedDialogVisible.value = false;
    await fetchKeywords();
    notifySummaryRefresh();
  } finally {
    confirmingSeeds.value = false;
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
      const clusterName = parts[1]?.trim() || undefined;
      return { keyword, clusterName };
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
