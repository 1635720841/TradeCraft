<!--
  评分校准实验室：从 Semrush 手动录入训练样本。

  边界：
  - 不负责：模型训练逻辑（父页面刷新 summary）
  - 不负责：Semrush RPA 执行
-->
<template>
  <el-card shadow="never" header="手动录入样本（从 Semrush）">
    <p class="mb-3 text-sm text-gray-500">
      在 Semrush 打开任意文章 → 复制正文粘贴 → 填写侧栏 Overall Score 即可入库。下方列表支持编辑与删除；保存后训练模型会自动重算。
    </p>

    <el-form label-position="top" class="max-w-3xl">
      <el-form-item label="目标关键词">
        <el-input
          v-model="form.targetKeywordsText"
          type="textarea"
          :rows="3"
          placeholder="每行一个，或用逗号分隔&#10;例如：&#10;teeth cleaning in soho&#10;dental cleaning in soho"
        />
        <div v-if="parsedKeywords.length" class="mt-2 flex flex-wrap gap-1">
          <el-tag v-for="kw in parsedKeywords" :key="kw" size="small" type="info">{{ kw }}</el-tag>
        </div>
      </el-form-item>
      <el-form-item label="正文">
        <ArticleContentPasteEditor v-model="form.content" />
      </el-form-item>
      <el-form-item label="Semrush 词数目标（可选）">
        <el-input-number v-model="form.targetWordCount" :min="0" :max="10000" :step="50" controls-position="right" placeholder="侧栏目标词数，如 887" class="w-full" />
        <p class="mt-1 text-xs text-gray-500">不填则按 SWA 规则推断；填 Semrush 侧栏「目标词数」本地预检更准</p>
      </el-form-item>
      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="Semrush 总分（必填）">
            <el-input-number v-model="form.semrushOverall" :min="0" :max="10" :step="0.1" controls-position="right" class="w-full" placeholder="侧栏 Overall Score" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="Semrush 节点（可选）">
            <el-input v-model="form.semrushNodeLabel" placeholder="如 Keyword coverage" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :xs="24" :sm="8">
          <el-form-item label="当前词数（可选）">
            <el-input-number v-model="form.semrushCurrentWordCount" :min="0" :max="50000" :step="10" controls-position="right" class="w-full" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="标杆词数（可选）">
            <el-input-number v-model="form.semrushCompetitorWordCount" :min="0" :max="50000" :step="10" controls-position="right" class="w-full" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="8">
          <el-form-item label="可读性（可选）">
            <el-input-number v-model="form.semrushReadabilityScore" :min="0" :max="100" :step="1" controls-position="right" class="w-full" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="备注（可选）">
        <el-input v-model="form.sourceNote" placeholder="如：竞品站某篇 / Semrush 示例文" />
      </el-form-item>
      <el-alert v-if="labelPreviewWarning" type="warning" :closable="false" show-icon :title="labelPreviewWarning" class="mb-3" />
      <el-form-item>
        <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">录入为训练样本</el-button>
        <span v-if="!canSubmit" class="ml-2 text-xs text-gray-500">需填写关键词、正文 ≥80 字、Semrush 总分</span>
      </el-form-item>
    </el-form>

    <el-descriptions v-if="lastResult" :column="2" border size="small" class="mb-4 max-w-3xl">
      <el-descriptions-item label="标题">{{ lastResult.title }}</el-descriptions-item>
      <el-descriptions-item label="本地预检">{{ lastResult.localScore }}</el-descriptions-item>
      <el-descriptions-item label="Semrush 真分">{{ lastResult.semrushOverall }}</el-descriptions-item>
      <el-descriptions-item label="朴素误差">{{ lastResult.naiveAbsError }}</el-descriptions-item>
      <el-descriptions-item label="累计手动样本" :span="2">{{ lastResult.manualSampleCount }} 条</el-descriptions-item>
    </el-descriptions>

    <div class="max-w-4xl">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-sm font-medium">已录入样本（{{ samples.length }}）</span>
        <el-button size="small" :loading="listLoading" @click="loadSamples">刷新列表</el-button>
      </div>
      <el-table v-loading="listLoading" :data="samples" size="small" max-height="240" empty-text="暂无手动录入样本">
        <el-table-column prop="title" label="标题" min-width="140" show-overflow-tooltip />
        <el-table-column prop="targetKeyword" label="关键词" min-width="120" show-overflow-tooltip />
        <el-table-column prop="localScore" label="本地" width="70" />
        <el-table-column prop="semrushOverall" label="Semrush" width="80" />
        <el-table-column prop="sourceNote" label="备注" min-width="100" show-overflow-tooltip />
        <el-table-column prop="importedAt" label="录入时间" width="160">
          <template #default="{ row }">{{ formatTime(row.importedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row.jobId)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(row.jobId)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <ScoreCalibrationManualSampleDialog
      v-model="editVisible"
      :project-id="projectId"
      :job-id="editingJobId"
      @saved="handleEdited"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessageBox } from "element-plus";
import { normalizeArticleScoreContent, parseTargetKeywordsInput, scoreLocalSeo, buildCalibrationLabelWarning } from "@wm/shared-core";
import {
  createManualCalibrationSample,
  deleteManualCalibrationSample,
  listManualCalibrationSamples,
  type ManualCalibrationSampleItem,
  type ManualCalibrationSampleResult
} from "@/api/seo-factory/score-calibration";
import { message } from "@/utils/message";
import ArticleContentPasteEditor from "../seo/ArticleContentPasteEditor.vue";
import ScoreCalibrationManualSampleDialog from "./ScoreCalibrationManualSampleDialog.vue";

defineOptions({ name: "ScoreCalibrationManualImportPanel" });

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  imported: [];
}>();

const form = reactive({
  targetKeywordsText: "",
  content: "",
  targetWordCount: undefined as number | undefined,
  semrushOverall: undefined as number | undefined,
  semrushNodeLabel: "",
  semrushCurrentWordCount: undefined as number | undefined,
  semrushCompetitorWordCount: undefined as number | undefined,
  semrushReadabilityScore: undefined as number | undefined,
  sourceNote: ""
});
const submitting = ref(false);
const listLoading = ref(false);
const lastResult = ref<ManualCalibrationSampleResult | null>(null);
const samples = ref<ManualCalibrationSampleItem[]>([]);
const editVisible = ref(false);
const editingJobId = ref<string | null>(null);

const parsedKeywords = computed(() => parseTargetKeywordsInput(form.targetKeywordsText));

const canSubmit = computed(
  () =>
    parsedKeywords.value.length > 0 &&
    form.content.trim().length >= 80 &&
    typeof form.semrushOverall === "number"
);

const labelPreviewWarning = computed(() => {
  if (typeof form.semrushOverall !== "number" || parsedKeywords.value.length === 0) {
    return null;
  }
  if (form.content.trim().length < 80) {
    return null;
  }
  const keywordList = parsedKeywords.value;
  const local = scoreLocalSeo({
    keyword: keywordList[0],
    submittedKeywords: keywordList.length > 1 ? keywordList.slice(1) : undefined,
    content: normalizeArticleScoreContent(form.content),
    targetWordCount: form.targetWordCount,
    competitorWordCount: form.semrushCompetitorWordCount
  });
  const naiveMapped = Math.round((local.score / 10) * 100) / 100;
  return buildCalibrationLabelWarning(naiveMapped, form.semrushOverall);
});

async function loadSamples() {
  listLoading.value = true;
  try {
    samples.value = await listManualCalibrationSamples(props.projectId);
  } finally {
    listLoading.value = false;
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function openEdit(jobId: string) {
  editingJobId.value = jobId;
  editVisible.value = true;
}

async function handleDelete(jobId: string) {
  try {
    await ElMessageBox.confirm("删除后将从训练集中移除该样本，且不可恢复。", "确认删除", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }
  try {
    await deleteManualCalibrationSample(props.projectId, jobId);
    message("样本已删除", { type: "success" });
    await loadSamples();
    emit("imported");
  } catch {
    // 拦截器已提示
  }
}

function handleEdited() {
  void loadSamples();
  emit("imported");
}

async function handleSubmit() {
  if (!canSubmit.value || typeof form.semrushOverall !== "number") return;
  const keywordList = parsedKeywords.value;
  submitting.value = true;
  try {
    lastResult.value = await createManualCalibrationSample(props.projectId, {
      targetKeyword: keywordList[0],
      submittedKeywords: keywordList,
      content: normalizeArticleScoreContent(form.content),
      targetWordCount: form.targetWordCount,
      semrushOverall: form.semrushOverall,
      semrushNodeLabel: form.semrushNodeLabel.trim() || undefined,
      semrushCurrentWordCount: form.semrushCurrentWordCount,
      semrushCompetitorWordCount: form.semrushCompetitorWordCount,
      semrushReadabilityScore: form.semrushReadabilityScore,
      sourceNote: form.sourceNote.trim() || undefined
    });
    if (lastResult.value.labelWarning) {
      message(lastResult.value.labelWarning, { type: "warning" });
    } else {
      message("样本已录入，模型将自动纳入训练", { type: "success" });
    }
    form.content = "";
    form.semrushOverall = undefined;
    await loadSamples();
    emit("imported");
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadSamples();
});
</script>
