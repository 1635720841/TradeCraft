<!--
  主题集群：按主题分组关键词，查看排产进度。

  边界：
  - 不负责：关键词 Semrush 指标（KeywordPoolView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">主题集群</span>
          <div class="flex flex-wrap gap-2">
            <el-button v-if="isAdmin" type="primary" @click="openCreateDialog">新建主题</el-button>
            <el-button @click="loadClusters">刷新</el-button>
            <el-button link type="primary" @click="goKeywords">关键词池</el-button>
          </div>
        </div>
      </template>

      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="运营怎么用？"
        description="把相关关键词归到同一主题（如「工业阀门选型」），方便按组排产。进度 = 已创建任务数 / 主题内关键词总数（非已上线）。"
      />

      <div v-loading="loading" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <el-card v-for="cluster in clusters" :key="cluster.id" shadow="hover">
          <div class="mb-2 flex items-start justify-between gap-2">
            <div>
              <div class="font-medium">{{ cluster.name }}</div>
              <p v-if="cluster.description" class="mt-1 text-sm text-gray-500 line-clamp-2">
                {{ cluster.description }}
              </p>
              <p v-if="cluster.pillarKeyword?.keyword" class="mt-1 text-xs text-amber-700">
                支柱词：{{ cluster.pillarKeyword.keyword }}
              </p>
            </div>
            <el-tag size="small" type="info">{{ cluster.keywordCount ?? 0 }} 词</el-tag>
          </div>

          <div class="mb-3">
            <div class="mb-1 flex justify-between text-xs text-gray-500">
              <span>已入队 {{ cluster.usedCount ?? 0 }} / 待写 {{ cluster.pendingCount ?? 0 }}</span>
              <span>{{ cluster.progressPercent ?? 0 }}%</span>
            </div>
            <el-progress
              :percentage="cluster.progressPercent ?? 0"
              :stroke-width="8"
              :status="(cluster.progressPercent ?? 0) >= 100 ? 'success' : undefined"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            <el-button
              v-if="(cluster.pendingCount ?? 0) > 0"
              size="small"
              type="primary"
              :loading="batchCreatingClusterId === cluster.id"
              @click="openBatchJobDialog(cluster)"
            >
              批量入队（{{ cluster.pendingCount }}）
            </el-button>
            <el-button size="small" @click="goClusterKeywords(cluster.id)">
              查看关键词
            </el-button>
            <el-button v-if="isAdmin" size="small" @click="openEditDialog(cluster)">编辑</el-button>
            <el-button
              v-if="isAdmin"
              size="small"
              type="danger"
              link
              @click="handleDelete(cluster)"
            >
              删除
            </el-button>
          </div>
        </el-card>
      </div>

      <el-empty v-if="!loading && clusters.length === 0" description="暂无主题，可先新建或从关键词池归入">
        <el-button v-if="isAdmin" type="primary" @click="openCreateDialog">新建主题</el-button>
      </el-empty>
    </el-card>

    <el-dialog v-model="formDialogVisible" :title="editingId ? '编辑主题' : '新建主题'" width="480px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="88px">
        <el-form-item label="主题名称" prop="name">
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
        <el-form-item v-if="editingId" label="支柱关键词">
          <el-select
            v-model="form.pillarKeywordId"
            class="w-full"
            clearable
            placeholder="选择本主题的支柱页关键词"
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
      </template>
    </el-dialog>

    <el-dialog v-model="batchJobDialogVisible" title="主题批量入队" width="480px">
      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="说明"
        description="将为该主题下所有「待筛选 / 已通过」的关键词各创建一个生成任务；已归档或已入队的会跳过。"
      />
      <el-form label-width="88px">
        <el-form-item label="主题">
          <span>{{ batchJobCluster?.name }}</span>
        </el-form-item>
        <el-form-item label="待入队">
          <span>{{ batchJobCluster?.pendingCount ?? 0 }} 个关键词</span>
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
      </el-form>
      <template #footer>
        <el-button @click="batchJobDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchCreating" @click="submitBatchCreateJobs">
          确认入队
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { ElMessageBox } from "element-plus";
import {
  createKeywordCluster,
  createJobsFromCluster,
  deleteKeywordCluster,
  listKeywordClusters,
  updateKeywordCluster,
  type KeywordClusterItem
} from "@/api/seo-factory/keyword-cluster";
import { listKeywords } from "@/api/seo-factory/keyword";
import { listSites } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { message } from "@/utils/message";
import { useUserStoreHook } from "@/store/modules/user";

defineOptions({ name: "TopicClusterView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const userStore = useUserStoreHook();
const isAdmin = computed(() => userStore.roles.includes("admin"));

const loading = ref(false);
const saving = ref(false);
const clusters = ref<KeywordClusterItem[]>([]);
const formDialogVisible = ref(false);
const batchJobDialogVisible = ref(false);
const batchCreating = ref(false);
const batchCreatingClusterId = ref<string | null>(null);
const batchJobCluster = ref<KeywordClusterItem | null>(null);
const sites = ref<SiteItem[]>([]);
const sitesLoading = ref(false);
const batchJobForm = reactive({ siteId: "" });
const editingId = ref("");
const formRef = ref<FormInstance>();

const form = reactive({
  name: "",
  description: "",
  pillarKeywordId: "" as string | null
});

const pillarKeywordOptions = ref<Array<{ id: string; keyword: string }>>([]);
const pillarKeywordsLoading = ref(false);

const formRules: FormRules = {
  name: [
    { required: true, message: "请输入主题名称", trigger: "blur" },
    { min: 2, message: "至少 2 个字符", trigger: "blur" }
  ]
};

async function loadClusters() {
  loading.value = true;
  try {
    clusters.value = await listKeywordClusters(projectId);
  } finally {
    loading.value = false;
  }
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
    const res = await listKeywords(projectId, 1, 200, { clusterId });
    pillarKeywordOptions.value = (res.data ?? []).map((item) => ({
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
        message("主题已更新", { type: "success" });
      } else {
        await createKeywordCluster(projectId, payload);
        message("主题已创建", { type: "success" });
      }
      formDialogVisible.value = false;
      await loadClusters();
    } finally {
      saving.value = false;
    }
  });
}

async function handleDelete(cluster: KeywordClusterItem) {
  await ElMessageBox.confirm(
    `删除「${cluster.name}」后，组内关键词会变为未分组，不会删除关键词本身。`,
    "确认删除",
    { type: "warning" }
  );
  await deleteKeywordCluster(projectId, cluster.id);
  message("主题已删除", { type: "success" });
  await loadClusters();
}

function goClusterKeywords(clusterId: string) {
  router.push({
    name: "SeoFactoryKeywords",
    params: { projectId },
    query: { clusterId }
  });
}

function goKeywords() {
  router.push({ name: "SeoFactoryKeywords", params: { projectId } });
}

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
  } finally {
    sitesLoading.value = false;
  }
}

function openBatchJobDialog(cluster: KeywordClusterItem) {
  batchJobCluster.value = cluster;
  batchJobForm.siteId = sites.value[0]?.id ?? "";
  batchJobDialogVisible.value = true;
  if (sites.value.length === 0) {
    void loadSites();
  }
}

async function submitBatchCreateJobs() {
  if (!batchJobCluster.value) return;
  batchCreating.value = true;
  batchCreatingClusterId.value = batchJobCluster.value.id;
  try {
    const result = await createJobsFromCluster(
      projectId,
      batchJobCluster.value.id,
      batchJobForm.siteId || undefined
    );
    message(`已入队 ${result.created} 个任务${result.skipped ? `，跳过 ${result.skipped} 个` : ""}`, {
      type: "success"
    });
    batchJobDialogVisible.value = false;
    await loadClusters();
  } finally {
    batchCreating.value = false;
    batchCreatingClusterId.value = null;
  }
}

onMounted(() => {
  void loadClusters();
});
</script>
