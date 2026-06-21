<!--
  手动校准样本编辑弹框：修改关键词、正文与 Semrush 真分。

  边界：
  - 不负责：列表加载（父组件 ScoreCalibrationManualImportPanel）
-->
<template>
  <el-dialog v-model="visible" title="编辑手动样本" width="720px" destroy-on-close @closed="handleClosed">
    <el-form v-loading="loading" label-position="top">
      <el-form-item label="目标关键词">
        <el-input
          v-model="form.targetKeywordsText"
          type="textarea"
          :rows="3"
          placeholder="每行一个，或用逗号分隔"
        />
        <div v-if="parsedKeywords.length" class="mt-2 flex flex-wrap gap-1">
          <el-tag v-for="kw in parsedKeywords" :key="kw" size="small" type="info">{{ kw }}</el-tag>
        </div>
      </el-form-item>
      <el-form-item label="正文">
        <ArticleContentPasteEditor v-model="form.content" />
      </el-form-item>
      <el-form-item label="Semrush 词数目标（可选）">
        <el-input-number v-model="form.targetWordCount" :min="0" :max="10000" :step="50" controls-position="right" class="w-full" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="Semrush 总分">
            <el-input-number v-model="form.semrushOverall" :min="0" :max="10" :step="0.1" controls-position="right" class="w-full" />
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
        <el-input v-model="form.sourceNote" placeholder="如：竞品站某篇" />
      </el-form-item>
      <el-alert v-if="labelPreviewWarning" type="warning" :closable="false" show-icon :title="labelPreviewWarning" />
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!canSave" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { normalizeArticleScoreContent, parseTargetKeywordsInput, scoreLocalSeo, buildCalibrationLabelWarning } from "@wm/shared-core";
import {
  getManualCalibrationSample,
  updateManualCalibrationSample
} from "@/api/seo-factory/score-calibration";
import { message } from "@/utils/message";
import ArticleContentPasteEditor from "../seo/ArticleContentPasteEditor.vue";

defineOptions({ name: "ScoreCalibrationManualSampleDialog" });

const props = defineProps<{
  projectId: string;
  jobId: string | null;
}>();

const emit = defineEmits<{
  saved: [];
}>();

const visible = defineModel<boolean>({ required: true });

const loading = ref(false);
const saving = ref(false);
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

const parsedKeywords = computed(() => parseTargetKeywordsInput(form.targetKeywordsText));
const canSave = computed(
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

async function loadDetail(jobId: string) {
  loading.value = true;
  try {
    const detail = await getManualCalibrationSample(props.projectId, jobId);
    const keywords =
      detail.submittedKeywords.length > 0 ? detail.submittedKeywords : [detail.targetKeyword];
    form.targetKeywordsText = keywords.join("\n");
    form.content = detail.content;
    form.targetWordCount = detail.targetWordCount;
    form.semrushOverall = detail.semrushOverall;
    form.semrushNodeLabel = detail.semrushNodeLabel ?? "";
    form.semrushCurrentWordCount = detail.semrushCurrentWordCount;
    form.semrushCompetitorWordCount = detail.semrushCompetitorWordCount;
    form.semrushReadabilityScore = detail.semrushReadabilityScore;
    form.sourceNote = detail.sourceNote ?? "";
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  if (!props.jobId || !canSave.value || typeof form.semrushOverall !== "number") return;
  const keywordList = parsedKeywords.value;
  saving.value = true;
  try {
    const result = await updateManualCalibrationSample(props.projectId, props.jobId, {
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
    if (result.labelWarning) {
      message(result.labelWarning, { type: "warning" });
    } else {
      message("样本已更新", { type: "success" });
    }
    visible.value = false;
    emit("saved");
  } finally {
    saving.value = false;
  }
}

function handleClosed() {
  form.targetKeywordsText = "";
  form.content = "";
  form.targetWordCount = undefined;
  form.semrushOverall = undefined;
  form.semrushNodeLabel = "";
  form.semrushCurrentWordCount = undefined;
  form.semrushCompetitorWordCount = undefined;
  form.semrushReadabilityScore = undefined;
  form.sourceNote = "";
}

watch(
  () => [visible.value, props.jobId] as const,
  ([open, jobId]) => {
    if (open && jobId) {
      void loadDetail(jobId);
    }
  }
);
</script>
