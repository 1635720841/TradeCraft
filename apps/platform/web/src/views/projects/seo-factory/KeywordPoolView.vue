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
            <el-button v-if="canManageKeywords" @click="openSeedDialog">AI 生成种子词</el-button>
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

      <div v-if="schedulingSummary?.unclusteredCount && quickFilter !== 'unclustered'" class="mb-4">
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>
            {{ schedulingSummary.unclusteredCount }} 个关键词尚未分组
          </template>
          <template #default>
            <span class="text-sm text-gray-600">建议先加入专题，再按主题批量创建任务。</span>
            <el-button link type="primary" class="ml-1" @click="goUnclusteredFilter">
              查看未分组
            </el-button>
          </template>
        </el-alert>
      </div>

      <div
        v-if="schedulingSummary?.highPriorityQueueableCount && quickFilter === 'queueable'"
        class="mb-4"
      >
        <el-alert type="success" :closable="false" show-icon>
          <template #title>
            {{ schedulingSummary.highPriorityQueueableCount }} 个高优先级待写词
          </template>
          <template #default>
            <span class="text-sm text-gray-600">建议优先勾选这些词创建任务或加入专题后排产。</span>
          </template>
        </el-alert>
      </div>

      <div v-if="filterClusterId || quickFilter !== 'all'" class="mb-4">
        <el-alert type="info" :closable="false" show-icon :title="activeFilterTitle">
          <template #default>
            <el-button link type="primary" @click="clearAllFilters">查看全部关键词</el-button>
          </template>
        </el-alert>
      </div>

      <div v-if="selectedKeywords.length" class="mb-4 flex flex-wrap items-center gap-2">
        <span class="text-sm text-gray-600">已选 {{ selectedKeywords.length }} 项</span>
        <el-button v-if="canManageKeywords" size="small" @click="openAssignClusterDialog">加入专题</el-button>
        <el-button
          v-if="canManageKeywords"
          size="small"
          type="danger"
          plain
          :loading="deleting"
          @click="handleBatchDelete"
        >
          删除
        </el-button>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <el-radio-group v-model="quickFilter" @change="onQuickFilterChange">
          <el-radio-button value="queueable">待写</el-radio-button>
          <el-radio-button value="unclustered">未分组</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
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
          placeholder="专题"
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
        <el-table-column prop="priorityScore" label="建议优先级" width="108" sortable>
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
        <el-table-column label="专题" width="130" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.cluster?.name">{{ row.cluster.name }}</span>
            <span v-else class="text-gray-400">未分组</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="88">
          <template #default="{ row }">
            <el-tag size="small" :type="displayStatus(row.status).type">
              {{ displayStatus(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="100">
          <template #default="{ row }">
            {{ dictLabel(keywordSourceDict, row.source) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
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
              v-if="canManageKeywords"
              type="primary"
              link
              @click="openEditDialog(row as KeywordEntryItem)"
            >
              编辑
            </el-button>
            <el-button
              v-if="canManageKeywords"
              type="danger"
              link
              :loading="deletingId === row.id"
              @click="handleDelete(row as KeywordEntryItem)"
            >
              删除
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

    <el-dialog v-model="assignClusterDialogVisible" title="加入专题" width="460px">
      <el-radio-group v-model="assignMode" class="mb-4">
        <el-radio value="existing">选择已有专题</el-radio>
        <el-radio value="new">新建专题</el-radio>
      </el-radio-group>
      <el-select
        v-if="assignMode === 'existing'"
        v-model="assignClusterId"
        class="w-full"
        placeholder="选择专题"
      >
        <el-option v-for="item in clusters" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-input
        v-else
        v-model="newClusterName"
        maxlength="100"
        show-word-limit
        placeholder="如：工业阀门选型"
      />
      <p class="mt-3 text-sm text-gray-500">
        将把已选的 {{ selectedKeywords.length }} 个关键词归入该专题。
      </p>
      <template #footer>
        <el-button @click="assignClusterDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="assigningCluster" @click="submitAssignCluster">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules, TableInstance } from "element-plus";
import {
  assignKeywordsToCluster,
  createKeywordCluster,
  listKeywordClusters,
  type KeywordClusterItem
} from "@/api/seo-factory/keyword-cluster";
import {
  createJobFromKeyword,
  createJobsFromKeywords,
  createKeyword,
  deleteKeyword,
  deleteKeywords,
  confirmKeywordSeeds,
  previewKeywordSeeds,
  type KeywordSeedCandidate,
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
import {
  getKeywordDisplayStatus,
  getKeywordPriorityTier,
  getKeywordPriorityTierHint,
  getKeywordPriorityTierLabel,
  getKeywordPriorityTierTagType,
  isKeywordQueueable
} from "@/utils/seo-factory/keyword-display";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import { useArticleQuotaPreview } from "@/composables/useArticleQuotaPreview";
import { keywordSchedulingContextKey } from "@/composables/seo-factory/keyword-scheduling-context";

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

const activeFilterTitle = computed(() => {
  const parts: string[] = [];
  if (quickFilter.value === "queueable") parts.push("待写");
  if (quickFilter.value === "unclustered") parts.push("未分组");
  if (filterClusterId.value) {
    const name = clusters.value.find((c) => c.id === filterClusterId.value)?.name;
    if (name) parts.push(`专题「${name}」`);
  }
  return parts.length ? `筛选：${parts.join(" · ")}` : "筛选中";
});

const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const generatingSeeds = ref(false);
const confirmingSeeds = ref(false);
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
const quickFilter = ref<"all" | "queueable" | "unclustered">("queueable");
const clusters = ref<KeywordClusterItem[]>([]);
const creatingJobId = ref<string | null>(null);
const deleting = ref(false);
const deletingId = ref<string | null>(null);

const formDialogVisible = ref(false);
const importDialogVisible = ref(false);
const batchJobDialogVisible = ref(false);
const seedDialogVisible = ref(false);
const seedStep = ref<"config" | "preview">("config");
const seedCandidates = ref<KeywordSeedCandidate[]>([]);
const selectedSeedCandidates = ref<KeywordSeedCandidate[]>([]);
const seedPreviewSiteId = ref("");
const seedPreviewTableRef = ref<TableInstance>();
const assignClusterDialogVisible = ref(false);
const assigningCluster = ref(false);
const assignClusterId = ref("");
const assignMode = ref<"existing" | "new">("existing");
const newClusterName = ref("");
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

function isRowSelectable(row: KeywordEntryItem) {
  return isKeywordQueueable(row.status);
}

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

function clearSelection() {
  tableRef.value?.clearSelection();
  selectedKeywords.value = [];
}

function handleSelectionChange(rows: KeywordEntryItem[]) {
  selectedKeywords.value = rows;
}

async function fetchKeywords() {
  loading.value = true;
  try {
    const res = await listKeywords(projectId, page.value, limit.value, {
      status: quickFilter.value === "queueable" ? undefined : filterStatus.value || undefined,
      intent: filterIntent.value || undefined,
      clusterId: filterClusterId.value || undefined,
      unclustered: quickFilter.value === "unclustered",
      queueable: quickFilter.value === "queueable",
      excludeArchived:
        quickFilter.value === "all" && !filterStatus.value ? undefined : false
    });
    keywords.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? keywords.value.length;
  } finally {
    loading.value = false;
  }
}

function notifySummaryRefresh() {
  emit("refreshSummary");
  void schedulingCtx?.refreshSummary();
}

function goUnclusteredFilter() {
  quickFilter.value = "unclustered";
  onQuickFilterChange();
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
  if (selectedKeywords.value.length === 0) {
    message("请先勾选关键词", { type: "warning" });
    return;
  }
  assignMode.value = clusters.value.length > 0 ? "existing" : "new";
  assignClusterId.value = clusters.value[0]?.id ?? "";
  newClusterName.value = "";
  assignClusterDialogVisible.value = true;
}

async function submitAssignCluster() {
  if (selectedKeywords.value.length === 0) return;

  const keywordIds = selectedKeywords.value.map((row) => row.id);

  if (assignMode.value === "new") {
    const name = newClusterName.value.trim();
    if (name.length < 2) {
      message("请输入至少 2 个字的专题名称", { type: "warning" });
      return;
    }
    assigningCluster.value = true;
    try {
      await createKeywordCluster(projectId, { name, keywordIds });
      message(`已创建专题并加入 ${keywordIds.length} 个关键词`, { type: "success" });
      assignClusterDialogVisible.value = false;
      clearSelection();
      await loadClusters();
      await fetchKeywords();
      notifySummaryRefresh();
    } finally {
      assigningCluster.value = false;
    }
    return;
  }

  if (!assignClusterId.value) {
    message("请选择专题", { type: "warning" });
    return;
  }
  assigningCluster.value = true;
  try {
    const result = await assignKeywordsToCluster(
      projectId,
      assignClusterId.value,
      keywordIds
    );
    message(`已加入专题：${result.assigned} 个关键词`, { type: "success" });
    assignClusterDialogVisible.value = false;
    clearSelection();
    await fetchKeywords();
    await loadClusters();
    notifySummaryRefresh();
  } finally {
    assigningCluster.value = false;
  }
}

function syncClusterFilterFromRoute() {
  const clusterId = route.query.clusterId;
  filterClusterId.value = typeof clusterId === "string" ? clusterId : "";
  if (filterClusterId.value) {
    quickFilter.value = "all";
  } else if (route.query.queueable === "1" || route.query.queueable === "true") {
    quickFilter.value = "queueable";
  } else if (route.query.unclustered === "1" || route.query.unclustered === "true") {
    quickFilter.value = "unclustered";
  } else if (route.query.all === "1" || route.query.all === "true") {
    quickFilter.value = "all";
  } else {
    quickFilter.value = "queueable";
  }
}

function onSizeChange() {
  page.value = 1;
  void fetchKeywords();
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
}

function openSeedDialog() {
  resetSeedDialog();
  seedForm.siteId = sites.value[0]?.id ?? "";
  seedForm.count = 15;
  seedForm.topicHint = "";
  seedDialogVisible.value = true;
  if (sites.value.length === 0) {
    void loadSites();
  }
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
