<!--
  Semrush 反推实验详情：复制单变量稿并录入重复检测结果。
-->
<template>
  <el-dialog append-to-body :model-value="visible" :title="experiment?.name ?? '反推实验'" width="88%" @close="emit('close')">
    <el-alert type="info" :closable="false" class="mb-3">
      每个版本用完全相同的关键词和数据库检测 3 次。请复制整篇正文；节点不同或波动超过 0.15 会自动降低置信度。
    </el-alert>
    <div v-if="experiment" class="mb-3 rounded bg-gray-50 p-3 text-xs text-gray-500">
      <div class="mb-1 font-medium text-gray-700">建议交错执行，避免 SEM 节点随时间漂移</div>
      <div v-for="plan in roundPlans" :key="plan.round">第 {{ plan.round }} 轮：{{ plan.labels.join(' → ') }}</div>
    </div>
    <el-alert
      v-if="experiment?.baselineDriftDetected"
      type="warning"
      :closable="false"
      show-icon
      class="mb-3"
      :title="`基线三轮波动 ${experiment.baselineSpread?.toFixed(1)} 分，当前实验可能受节点或时间漂移影响`"
    />

    <el-card v-if="experiment" shadow="never" class="mb-3">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-medium">AI 研究助理</div>
            <div class="mt-1 text-xs text-gray-400">只解读统计证据并建议下一轮实验，不修改对照稿</div>
          </div>
          <div class="flex items-center gap-2">
            <el-tag v-if="experiment.aiAnalysis?.stale" type="warning" size="small">数据已更新，建议重新分析</el-tag>
            <el-button
              type="primary"
              :loading="analyzing"
              :disabled="!canAnalyze"
              @click="runAiAnalysis"
            >
              {{ experiment.aiAnalysis ? "重新分析" : "AI 分析实验" }}
            </el-button>
          </div>
        </div>
      </template>

      <template v-if="experiment.aiAnalysis">
        <el-alert
          :title="experiment.aiAnalysis.summary"
          type="success"
          :closable="false"
          show-icon
          class="mb-3"
        />
        <div v-if="experiment.aiAnalysis.findings.length" class="mb-4 space-y-2">
          <div class="text-sm font-medium">证据结论</div>
          <div
            v-for="finding in experiment.aiAnalysis.findings"
            :key="`${finding.factorKey}-${finding.title}`"
            class="rounded border border-gray-100 p-3"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ finding.title }}</span>
              <el-tag size="small" :type="confidenceType(finding.confidence)">
                {{ confidenceLabel(finding.confidence) }}
              </el-tag>
            </div>
            <div class="mt-1 text-xs text-gray-500">{{ finding.evidence }}</div>
            <div class="mt-1 text-sm text-gray-700">{{ finding.interpretation }}</div>
          </div>
        </div>
        <div v-if="experiment.aiAnalysis.nextActions.length" class="mb-3">
          <div class="mb-2 text-sm font-medium">下一轮建议</div>
          <div v-for="action in experiment.aiAnalysis.nextActions" :key="action.title" class="mb-2 text-sm">
            <el-tag size="small" :type="priorityType(action.priority)" class="mr-2">{{ priorityLabel(action.priority) }}</el-tag>
            <span class="font-medium">{{ action.title }}</span>
            <span class="ml-2 text-gray-500">{{ action.rationale }}</span>
          </div>
          <el-button
            v-if="titleFollowUpRecommended"
            :loading="creatingTitleFollowUp"
            type="primary"
            plain
            class="mt-2"
            @click="createTitleFollowUp"
          >
            一键创建标题长度梯度实验
          </el-button>
          <el-button
            v-if="keywordFollowUpRecommended"
            :loading="creatingKeywordFollowUp"
            type="primary"
            plain
            class="mt-2 ml-2"
            @click="createKeywordFollowUp"
          >
            一键创建关键词位置实验
          </el-button>
          <el-button
            v-if="readabilityFollowUpRecommended"
            :loading="creatingReadabilityFollowUp"
            type="primary"
            plain
            class="mt-2 ml-2"
            @click="createReadabilityFollowUp"
          >
            一键创建可读性强变异实验
          </el-button>
        </div>
        <div v-if="experiment.aiAnalysis.limitations.length" class="text-xs text-orange-500">
          局限：{{ experiment.aiAnalysis.limitations.join("；") }}
        </div>
      </template>
      <el-empty v-else :image-size="48" description="录入基线及至少一个变量的分数后，可生成 AI 实验解读" />
    </el-card>

    <el-collapse v-if="experiment" accordion>
      <el-collapse-item v-for="variant in experiment.variants" :key="variant.key" :name="variant.key">
        <template #title>
          <div class="flex flex-1 items-center gap-2 pr-4">
            <span class="font-medium">{{ variant.label }}</span>
            <el-tag v-if="variant.deltaFromBaseline !== null" size="small" :type="deltaType(variant.deltaFromBaseline)">
              Δ {{ signed(variant.deltaFromBaseline) }}
            </el-tag>
            <el-tag size="small" :type="confidenceType(variant.confidence)">{{ confidenceLabel(variant.confidence) }}</el-tag>
            <span v-if="variant.key !== 'baseline'" class="text-xs text-gray-400">配对 {{ variant.pairedSampleCount }} 轮</span>
            <span class="ml-auto text-xs text-gray-400">{{ variant.trials.length }}/3 次</span>
          </div>
        </template>

        <p class="mb-2 text-sm text-gray-500">{{ variant.mutationSummary }}</p>
        <div class="mb-2 rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
          实验 H1（{{ titleMeta(variant.content).charCount }} 字符 / {{ titleMeta(variant.content).wordCount }} 词）：
          {{ titleMeta(variant.content).title || "已移除标题" }}
          <span class="ml-2 text-xs text-blue-600">{{ titleMeta(variant.content).hint }}</span>
        </div>
        <div class="mb-3 flex items-center gap-2">
          <el-button size="small" type="primary" @click="copyRichContent(variant.content)">富文本复制（推荐）</el-button>
          <el-button v-copy:click="variant.content" size="small">复制 Markdown</el-button>
          <el-button v-copy:click="experiment.submittedKeywords.join(', ')" size="small">复制提交词</el-button>
          <span class="text-xs text-gray-400">提交词保持：{{ experiment.submittedKeywords.join('、') }}</span>
        </div>
        <el-input :model-value="variant.content" type="textarea" :rows="6" readonly />

        <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div v-for="index in 3" :key="index" class="flex gap-1">
            <el-input-number
              v-model="drafts[variant.key].scores[index - 1]"
              class="min-w-0 flex-1"
              :min="0"
              :max="10"
              :step="0.1"
              :precision="1"
              :placeholder="`第 ${index} 次分数`"
              @change="markTrialObserved(variant.key, index - 1)"
            />
            <el-button
              :loading="runningTrialKey === `${variant.key}:${index}`"
              :disabled="Boolean(runningTrialKey)"
              @click="runTrial(variant.key, index)"
            >自动测</el-button>
          </div>
          <el-input v-model="drafts[variant.key].nodeLabel" placeholder="SEM 节点（必填后才可能中置信）" />
          <el-input v-model="drafts[variant.key].databaseLabel" placeholder="地区数据库，例如 US" />
        </div>
        <el-input
          v-model="drafts[variant.key].observation"
          class="mt-3"
          type="textarea"
          :rows="3"
          placeholder="粘贴 SEM 侧栏提示、四维分数或异常现象；这些原始证据会随实验保存"
        />
        <div class="mt-3 flex items-center justify-between">
          <span class="text-xs text-orange-500">{{ variant.warnings.join('；') }}</span>
          <el-button :loading="savingKey === variant.key" type="success" @click="saveVariant(variant.key)">保存检测结果</el-button>
        </div>
      </el-collapse-item>
    </el-collapse>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { message } from "@/utils/message";
import { markdownToSemrushHtml } from "@/utils/seo-factory/draft-content";
import { analyzeSemrushTitleThreshold } from "@wm/shared-core";
import {
  analyzeScoreReverseExperiment,
  createScoreReverseExperiment,
  runScoreReverseTrial,
  updateScoreReverseTrials,
  type ScoreReverseExperiment,
  type ScoreReverseFactorKey
} from "@/api/seo-factory/score-calibration";

defineOptions({ name: "ScoreReverseExperimentDialog" });

const props = defineProps<{
  visible: boolean;
  projectId: string;
  experiment: ScoreReverseExperiment | null;
}>();
const emit = defineEmits<{
  close: [];
  updated: [experiment: ScoreReverseExperiment];
  created: [experiment: ScoreReverseExperiment];
}>();

type VariantKey = "baseline" | ScoreReverseFactorKey;
interface TrialDraft {
  scores: Array<number | null>;
  checkedAts: Array<string | null>;
  nodeLabel: string;
  databaseLabel: string;
  observation: string;
}

const drafts = reactive<Record<string, TrialDraft>>({});
const savingKey = ref<string | null>(null);
const analyzing = ref(false);
const creatingTitleFollowUp = ref(false);
const creatingKeywordFollowUp = ref(false);
const creatingReadabilityFollowUp = ref(false);
const runningTrialKey = ref<string | null>(null);
const TITLE_GRADIENT_FACTORS: ScoreReverseFactorKey[] = [
  "title_compact",
  "title_near_limit",
  "title_too_long"
];
const KEYWORD_POSITION_FACTORS: ScoreReverseFactorKey[] = [
  "primary_keyword_title_only",
  "primary_keyword_body_only"
];
const READABILITY_STRONG_FACTORS: ScoreReverseFactorKey[] = [
  "long_paragraph_strong",
  "long_sentence_strong",
  "complex_words_strong",
  "casual_tone_strong",
  "tone_hype_strong",
  "tone_formal_strong"
];
const MILD_READABILITY_FACTORS: ScoreReverseFactorKey[] = [
  "long_paragraph",
  "long_sentence",
  "complex_words",
  "casual_tone"
];
const canAnalyze = computed(() => {
  const variants = props.experiment?.variants ?? [];
  return variants.some(item => item.key === "baseline" && item.medianScore !== null)
    && variants.some(item => item.key !== "baseline" && item.medianScore !== null);
});
const titleFollowUpFactors = computed<ScoreReverseFactorKey[]>(() => TITLE_GRADIENT_FACTORS);
const titleFollowUpRecommended = computed(() => {
  const analysis = props.experiment?.aiAnalysis;
  if (!analysis) return false;
  const titleWasRecommended = [...analysis.findings, ...analysis.nextActions].some(item =>
    item.factorKey?.startsWith("title_")
    || item.title.includes("标题")
  );
  const alreadyHasGradient = TITLE_GRADIENT_FACTORS.every(factor =>
    props.experiment?.factors.includes(factor)
  );
  return titleWasRecommended && !alreadyHasGradient;
});
const keywordFollowUpRecommended = computed(() => {
  const analysis = props.experiment?.aiAnalysis;
  if (!analysis) return false;
  const keywordWasRecommended = [...analysis.findings, ...analysis.nextActions].some(item =>
    item.factorKey?.startsWith("primary_keyword_")
    || item.title.includes("关键词")
  );
  const alreadyHasPositionTest = KEYWORD_POSITION_FACTORS.every(factor =>
    props.experiment?.factors.includes(factor)
  );
  return keywordWasRecommended && !alreadyHasPositionTest;
});
const readabilityFollowUpRecommended = computed(() => {
  const experiment = props.experiment;
  if (!experiment) return false;
  const mildVariants = experiment.variants.filter(item =>
    MILD_READABILITY_FACTORS.includes(item.key as ScoreReverseFactorKey)
    && item.medianScore !== null
  );
  const mildNoEffect = mildVariants.length > 0
    && mildVariants.every(item => Math.abs(item.deltaFromBaseline ?? 0) < 0.2);
  const analysisMentionsReadability = experiment.aiAnalysis
    ? [...experiment.aiAnalysis.findings, ...experiment.aiAnalysis.nextActions].some(item =>
        /readab|可读|段落|句长|复杂词|语气|long_|complex_|casual_/.test(
          `${item.factorKey ?? ""} ${item.title} ${"rationale" in item ? item.rationale : ""}`
        )
      )
    : false;
  const alreadyHasStrongTest = READABILITY_STRONG_FACTORS.every(factor =>
    experiment.factors.includes(factor)
  );
  return (mildNoEffect || analysisMentionsReadability) && !alreadyHasStrongTest;
});
const roundPlans = computed(() => {
  const labels = props.experiment?.variants.map(variant => variant.label) ?? [];
  if (labels.length === 0) return [];
  const pivot = Math.floor(labels.length / 2);
  return [
    { round: 1, labels },
    { round: 2, labels: [...labels].reverse() },
    { round: 3, labels: [...labels.slice(pivot), ...labels.slice(0, pivot)] }
  ];
});

function hydrateDrafts() {
  for (const variant of props.experiment?.variants ?? []) {
    drafts[variant.key] = {
      scores: [0, 1, 2].map(index => variant.trials[index]?.score ?? null),
      checkedAts: [0, 1, 2].map(index => variant.trials[index]?.checkedAt ?? null),
      nodeLabel: variant.trials[0]?.nodeLabel ?? "",
      databaseLabel: variant.trials[0]?.databaseLabel ?? "",
      observation: props.experiment?.observations?.[variant.key] ?? ""
    };
  }
}

watch(
  () => [props.visible, props.experiment?.id, props.experiment?.updatedAt],
  hydrateDrafts,
  { immediate: true }
);

async function saveVariant(key: VariantKey) {
  if (!props.experiment) return;
  const draft = drafts[key];
  const trials = draft.scores.flatMap((score, index) =>
    typeof score === "number"
      ? [{
          score,
          round: index + 1,
          nodeLabel: draft.nodeLabel.trim() || undefined,
          databaseLabel: draft.databaseLabel.trim() || undefined,
          checkedAt: draft.checkedAts[index] ?? new Date().toISOString()
        }]
      : []
  );
  if (trials.length === 0) {
    message("请至少填写一次 SEM 分数", { type: "warning" });
    return;
  }
  savingKey.value = key;
  try {
    const updated = await updateScoreReverseTrials(props.projectId, props.experiment.id, {
      variantKey: key,
      trials,
      observation: draft.observation.trim() || undefined
    });
    emit("updated", updated);
    message("检测结果已保存", { type: "success" });
  } finally {
    savingKey.value = null;
  }
}

function markTrialObserved(key: string, index: number) {
  const draft = drafts[key];
  if (!draft) return;
  draft.checkedAts[index] = new Date().toISOString();
}

async function runTrial(key: VariantKey, round: number) {
  if (!props.experiment || runningTrialKey.value) return;
  runningTrialKey.value = `${key}:${round}`;
  try {
    const preferredNodeKey = props.experiment.variants
      .find(variant => variant.key === "baseline")
      ?.trials.find(trial => (trial.round ?? 0) === round)?.nodeKey;
    const updated = await runScoreReverseTrial(props.projectId, props.experiment.id, {
      variantKey: key,
      round,
      preferredNodeKey
    });
    emit("updated", updated);
    message(`第 ${round} 轮真实 Semrush 检测已保存`, { type: "success" });
  } finally {
    runningTrialKey.value = null;
  }
}

async function runAiAnalysis() {
  if (!props.experiment || !canAnalyze.value) {
    message("请先录入基线和至少一个实验变量的检测分数", { type: "warning" });
    return;
  }
  analyzing.value = true;
  try {
    const updated = await analyzeScoreReverseExperiment(
      props.projectId,
      props.experiment.id
    );
    emit("updated", updated);
    message("AI 实验分析已生成", { type: "success" });
  } finally {
    analyzing.value = false;
  }
}

async function createTitleFollowUp() {
  if (!props.experiment) return;
  creatingTitleFollowUp.value = true;
  try {
    const baseName = props.experiment.name.replace(/(?: · (?:标题长度(?:精细|梯度)|关键词位置|可读性强变异)实验)+$/u, "");
    const created = await createScoreReverseExperiment(props.projectId, {
      name: `${baseName} · 标题长度梯度实验`,
      targetKeyword: props.experiment.targetKeyword,
      submittedKeywords: props.experiment.submittedKeywords,
      baselineContent: props.experiment.baselineContent,
      factors: titleFollowUpFactors.value
    });
    emit("created", created);
    message("下一轮标题实验已创建，正文内容保持不变", { type: "success" });
  } finally {
    creatingTitleFollowUp.value = false;
  }
}

async function createKeywordFollowUp() {
  if (!props.experiment) return;
  creatingKeywordFollowUp.value = true;
  try {
    const baseName = props.experiment.name.replace(/(?: · (?:标题长度(?:精细|梯度)|关键词位置|可读性强变异)实验)+$/u, "");
    const created = await createScoreReverseExperiment(props.projectId, {
      name: `${baseName} · 关键词位置实验`,
      targetKeyword: props.experiment.targetKeyword,
      submittedKeywords: props.experiment.submittedKeywords,
      baselineContent: props.experiment.baselineContent,
      factors: KEYWORD_POSITION_FACTORS
    });
    emit("created", created);
    message("下一轮关键词位置实验已创建，正文内容保持不变", { type: "success" });
  } finally {
    creatingKeywordFollowUp.value = false;
  }
}

async function createReadabilityFollowUp() {
  if (!props.experiment) return;
  creatingReadabilityFollowUp.value = true;
  try {
    const baseName = props.experiment.name.replace(/(?: · (?:标题长度(?:精细|梯度)|关键词位置|可读性强变异)实验)+$/u, "");
    const created = await createScoreReverseExperiment(props.projectId, {
      name: `${baseName} · 可读性强变异实验`,
      targetKeyword: props.experiment.targetKeyword,
      submittedKeywords: props.experiment.submittedKeywords,
      baselineContent: props.experiment.baselineContent,
      factors: READABILITY_STRONG_FACTORS
    });
    emit("created", created);
    message("可读性与语气强变异实验已创建，仅加大段落/句长/词汇/语气改动幅度", { type: "success" });
  } finally {
    creatingReadabilityFollowUp.value = false;
  }
}

async function copyRichContent(content: string) {
  try {
    const html = markdownToSemrushHtml(content);
    const expectedWords = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/[#*`|>-]/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([content], { type: "text/plain" })
        })
      ]);
    } else {
      await navigator.clipboard.writeText(content);
    }
    message(`已复制完整稿，预计约 ${expectedWords} 词；Semrush 显著偏少时请勿检测`, { type: "success" });
  } catch {
    message("富文本复制失败，请使用 Markdown 复制按钮", { type: "error" });
  }
}

function signed(value: number) { return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1); }
function deltaType(value: number) { return value < 0 ? "danger" : value > 0 ? "success" : "info"; }
function confidenceType(value: string) { return value === "high" ? "success" : value === "medium" ? "warning" : "info"; }
function confidenceLabel(value: string) {
  return ({ high: "高置信", medium: "中置信", low: "低置信", insufficient: "待补数据" } as Record<string, string>)[value] ?? value;
}
function priorityType(value: string) { return value === "high" ? "danger" : value === "medium" ? "warning" : "info"; }
function priorityLabel(value: string) { return ({ high: "高优先", medium: "中优先", low: "低优先" } as Record<string, string>)[value] ?? value; }
function variantTitle(content: string) { return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ""; }
function titleMeta(content: string) { return analyzeSemrushTitleThreshold(variantTitle(content)); }
</script>
