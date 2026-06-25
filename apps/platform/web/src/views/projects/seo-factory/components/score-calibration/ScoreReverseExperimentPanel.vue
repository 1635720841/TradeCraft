<!--
  Semrush 黑盒规则反推实验：创建单变量稿、展示差分结论。
-->
<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <div class="font-medium">SEM 评分规则反推</div>
          <div class="mt-1 text-xs text-gray-400">单变量 A/B · 每稿重复 3 次 · 中位数差分</div>
        </div>
        <el-button type="primary" @click="createVisible = true">新建反推实验</el-button>
      </div>
    </template>

    <el-alert type="warning" :closable="false" class="mb-3">
      目标是高精度近似黑盒规则，不承诺数学意义上的 99%。节点、关键词和地区数据库必须保持一致。
    </el-alert>

    <div class="mb-4 rounded border border-gray-100 p-3">
      <div class="mb-2 flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">跨文章规则证据</div>
          <div class="mt-1 text-xs text-gray-400">单篇实验只算候选；至少 5 篇可复现，10 篇且跨节点一致才可验证</div>
        </div>
        <el-tag type="info" size="small">{{ evidence.length }} 条候选规则</el-tag>
      </div>
      <el-table :data="evidence" size="small" empty-text="完成实验后生成跨文章证据">
        <el-table-column prop="label" label="因素" min-width="130" />
        <el-table-column label="有效组/文章/节点" width="130">
          <template #default="{ row }">{{ row.eligibleExperimentCount }}/{{ row.articleCount }}/{{ row.nodeCount }}</template>
        </el-table-column>
        <el-table-column label="中位影响" width="90">
          <template #default="{ row }">{{ row.medianDelta === null ? "—" : signed(row.medianDelta) }}</template>
        </el-table-column>
        <el-table-column label="同向率" width="90">
          <template #default="{ row }">{{ row.directionConsistency === null ? "—" : `${Math.round(row.directionConsistency * 100)}%` }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="evidenceStatusType(row.status)">{{ evidenceStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下一步" min-width="220">
          <template #default="{ row }"><span class="text-xs text-gray-500">{{ row.warnings.join("；") || "可进入生产候选评审" }}</span></template>
        </el-table-column>
      </el-table>
    </div>

    <el-table v-loading="loading" :data="experiments" size="small" empty-text="暂无反推实验">
      <el-table-column prop="name" label="实验" min-width="160" />
      <el-table-column prop="targetKeyword" label="目标关键词" min-width="150" show-overflow-tooltip />
      <el-table-column label="完成度" width="130">
        <template #default="{ row }">{{ row.completedVariants }}/{{ row.totalVariants }} 组</template>
      </el-table-column>
      <el-table-column label="已确认规则" min-width="220">
        <template #default="{ row }">
          <span class="text-xs text-gray-600">{{ strongestFinding(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openExperiment(row)">检测/录入</el-button>
          <el-button link type="danger" @click="removeExperiment(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createVisible" append-to-body title="创建单变量反推实验" width="760px">
      <el-form label-width="100px">
        <el-form-item label="实验名称"><el-input v-model="form.name" placeholder="例如：BMS 文章评分规则" /></el-form-item>
        <el-form-item label="目标关键词"><el-input v-model="form.targetKeyword" /></el-form-item>
        <el-form-item label="提交词">
          <el-input
            v-model="form.submittedKeywords"
            type="textarea"
            :rows="3"
            placeholder="每行一个，或用逗号分隔；每次 SEM 检测保持相同&#10;例如：&#10;teeth cleaning in soho&#10;dental cleaning in soho"
          />
          <div v-if="parsedSubmittedKeywords.length" class="mt-2 flex flex-wrap gap-1">
            <el-tag v-for="kw in parsedSubmittedKeywords" :key="kw" size="small" type="info">{{ kw }}</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="实验变量">
          <el-checkbox-group v-model="form.factors">
            <el-checkbox v-for="item in factorOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="基线正文">
          <ArticleContentPasteEditor v-model="form.baselineContent" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button :loading="creating" type="primary" @click="createExperiment">生成对照稿</el-button>
      </template>
    </el-dialog>

    <ScoreReverseExperimentDialog
      :visible="detailVisible"
      :project-id="projectId"
      :experiment="activeExperiment"
      @close="detailVisible = false"
      @updated="handleUpdated"
      @created="handleCreated"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessageBox } from "element-plus";
import { normalizeArticleScoreContent, parseTargetKeywordsInput } from "@wm/shared-core";
import { message } from "@/utils/message";
import ArticleContentPasteEditor from "../seo/ArticleContentPasteEditor.vue";
import {
  createScoreReverseExperiment,
  deleteScoreReverseExperiment,
  getScoreReverseEvidence,
  listScoreReverseExperiments,
  type ScoreReverseExperiment,
  type ScoreReverseFactorKey,
  type ScoreReverseRuleEvidence
} from "@/api/seo-factory/score-calibration";
import ScoreReverseExperimentDialog from "./ScoreReverseExperimentDialog.vue";

defineOptions({ name: "ScoreReverseExperimentPanel" });
const props = defineProps<{ projectId: string }>();

const factorOptions: Array<{ value: ScoreReverseFactorKey; label: string }> = [
  { value: "title_compact", label: "标题精简版" }, { value: "title_near_limit", label: "标题临界长度" },
  { value: "title_too_long", label: "标题过长" },
  { value: "title_missing", label: "移除标题" },
  { value: "duplicate_heading", label: "重复 H2" },
  { value: "long_paragraph", label: "超长段落" }, { value: "long_sentence", label: "超长句" },
  { value: "complex_words", label: "复杂词" }, { value: "casual_tone", label: "随意语气" },
  { value: "long_paragraph_strong", label: "超长段落（强）" },
  { value: "long_sentence_strong", label: "超长句（强）" },
  { value: "complex_words_strong", label: "复杂词（强）" },
  { value: "casual_tone_strong", label: "随意语气（强）" },
  { value: "tone_hype_strong", label: "营销语气（强）" },
  { value: "tone_formal_strong", label: "学术语气（强）" },
  { value: "primary_keyword_missing", label: "移除主关键词" },
  { value: "primary_keyword_title_only", label: "标题保留关键词" },
  { value: "primary_keyword_body_only", label: "正文保留关键词" }
];

const loading = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const detailVisible = ref(false);
const experiments = ref<ScoreReverseExperiment[]>([]);
const evidence = ref<ScoreReverseRuleEvidence[]>([]);
const activeExperiment = ref<ScoreReverseExperiment | null>(null);
const form = reactive({
  name: "",
  targetKeyword: "",
  submittedKeywords: "",
  baselineContent: "",
  factors: factorOptions.map(item => item.value)
});

const parsedSubmittedKeywords = computed(() => parseTargetKeywordsInput(form.submittedKeywords));

async function load() {
  loading.value = true;
  try {
    [experiments.value, evidence.value] = await Promise.all([
      listScoreReverseExperiments(props.projectId),
      getScoreReverseEvidence(props.projectId)
    ]);
  }
  finally { loading.value = false; }
}

async function loadEvidence() {
  evidence.value = await getScoreReverseEvidence(props.projectId);
}

async function createExperiment() {
  if (!form.name.trim() || !form.targetKeyword.trim() || form.baselineContent.trim().length < 80) {
    message("请填写实验名称、关键词和完整基线正文", { type: "warning" }); return;
  }
  creating.value = true;
  try {
    const created = await createScoreReverseExperiment(props.projectId, {
      name: form.name.trim(), targetKeyword: form.targetKeyword.trim(),
      submittedKeywords: parsedSubmittedKeywords.value,
      baselineContent: normalizeArticleScoreContent(form.baselineContent),
      factors: form.factors
    });
    experiments.value.unshift(created); createVisible.value = false; openExperiment(created);
  } finally { creating.value = false; }
}

function openExperiment(row: unknown) {
  const experiment = row as ScoreReverseExperiment;
  activeExperiment.value = experiment; detailVisible.value = true;
}

function handleUpdated(experiment: ScoreReverseExperiment) {
  const index = experiments.value.findIndex(item => item.id === experiment.id);
  if (index >= 0) experiments.value[index] = experiment;
  activeExperiment.value = experiment;
  void loadEvidence();
}

function handleCreated(experiment: ScoreReverseExperiment) {
  experiments.value.unshift(experiment);
  activeExperiment.value = experiment;
  void loadEvidence();
}

async function removeExperiment(row: unknown) {
  const experiment = row as ScoreReverseExperiment;
  await ElMessageBox.confirm(`确认删除“${experiment.name}”？`, "删除反推实验", { type: "warning" });
  await deleteScoreReverseExperiment(props.projectId, experiment.id);
  experiments.value = experiments.value.filter(item => item.id !== experiment.id);
  await loadEvidence();
}

function strongestFinding(row: unknown): string {
  const experiment = row as ScoreReverseExperiment;
  const ranked = experiment.variants.filter(item => ["high", "medium"].includes(item.confidence) && item.deltaFromBaseline !== null)
    .sort((a, b) => Math.abs(b.deltaFromBaseline ?? 0) - Math.abs(a.deltaFromBaseline ?? 0));
  const top = ranked[0];
  return top ? `${top.label}：${(top.deltaFromBaseline ?? 0) > 0 ? "+" : ""}${top.deltaFromBaseline?.toFixed(1)}` : "完成基线与变量各 3 次后生成";
}

function signed(value: number) { return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1); }
function evidenceStatusType(value: string) {
  return value === "validated" ? "success" : value === "replicated" ? "warning" : value === "inconclusive" ? "danger" : "info";
}
function evidenceStatusLabel(value: string) {
  return ({ candidate: "候选", replicated: "已复现", validated: "已验证", inconclusive: "不明确" } as Record<string, string>)[value] ?? value;
}

onMounted(() => { void load(); });
</script>
