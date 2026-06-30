<!--
  评分校准实验室：对比本地预检与 Semrush 真分，训练校准模型（管理端）。

  边界：
  - 不负责：Semrush RPA 终检执行
  - 不负责：运营向任务列表展示
-->
<template>
  <div class="p-4 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <el-button v-if="!consoleMode" link type="primary" @click="goSettings">← 返回项目配置</el-button>
        <el-button v-else link type="primary" @click="goConsoleDiagnostics">← 返回项目诊断</el-button>
        <h1 class="mt-1 text-lg font-medium">评分校准实验室</h1>
        <p class="text-sm text-gray-500">
          用历史任务的本地分与 Semrush 真分训练校准模型，预测 Semrush 分并导出训练集。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button :loading="loading" @click="loadSummary">刷新</el-button>
        <el-button type="primary" :loading="exporting" @click="handleExport">导出训练集</el-button>
      </div>
    </div>

    <el-alert
      v-if="readinessAlert"
      :type="readinessAlert.type"
      :closable="false"
      show-icon
      :title="readinessAlert.title"
    >
      <template #default>
        <p>{{ readinessAlert.description }}</p>
        <div v-if="readinessAlert.actions.length" class="mt-2 flex flex-wrap gap-2">
          <el-button
            v-for="action in readinessAlert.actions"
            :key="action.key"
            size="small"
            :type="action.buttonType"
            @click="handleReadinessAction(action.key)"
          >
            {{ action.label }}
          </el-button>
        </div>
      </template>
    </el-alert>

    <el-alert
      v-if="summary?.readinessGates"
      type="info"
      :closable="false"
      show-icon
      title="试验级门控进度"
      class="mb-0"
    >
      <template #default>
        <p class="text-sm">
          验证样本 {{ summary.readinessGates.trial.holdoutSamples.current }}/{{ summary.readinessGates.trial.holdoutSamples.required }}
          · 验证 MAE {{ summary.readinessGates.trial.holdoutMae.current ?? "—" }}（需 ≤{{ summary.readinessGates.trial.holdoutMae.max }}）
        </p>
        <p class="mt-1 text-xs text-gray-500">{{ summary.readinessGates.confidenceNote }}</p>
      </template>
    </el-alert>

    <el-alert
      v-if="(summary?.outlierPairCount ?? 0) > 0"
      type="warning"
      :closable="false"
      show-icon
      :title="`检测到 ${summary?.outlierPairCount ?? 0} 条可能离群样本`"
    >
      <template #default>
        <p class="text-sm">与同项目其他样本关键词重叠偏低，可能来自不同主题或测试词，建议排除或单独建项目。</p>
      </template>
    </el-alert>

    <ScoreCalibrationManualImportPanel :project-id="effectiveProjectId" @imported="handleManualImported" />

    <ScoreReverseExperimentPanel :project-id="effectiveProjectId" />

    <ScoreCalibrationMissingJobsPanel
      ref="missingJobsRef"
      :project-id="effectiveProjectId"
      @open-job="goJob"
    />

    <el-row v-loading="loading" :gutter="12">
      <el-col v-for="card in statCards" :key="card.label" :xs="12" :sm="8" :md="6">
        <el-card shadow="never" class="h-full">
          <div class="text-sm text-gray-500">{{ card.label }}</div>
          <div class="mt-1 text-2xl font-semibold">{{ card.value }}</div>
          <div v-if="card.hint" class="mt-1 text-xs text-gray-400">{{ card.hint }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" header="验证集校准误差分布">
          <el-table :data="summary?.holdoutErrorBuckets ?? []" size="small" empty-text="暂无验证集样本">
            <el-table-column prop="label" label="误差区间" width="100" />
            <el-table-column prop="count" label="样本数" width="90" />
            <el-table-column prop="avgAbsError" label="平均误差" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never" header="验证集散点（最多 120 条，按任务留出 20%）">
          <el-table :data="summary?.holdoutScatterSample ?? []" size="small" max-height="280" empty-text="暂无验证集">
            <el-table-column prop="localMapped" label="本地/10" width="80" />
            <el-table-column prop="semrushOverall" label="Semrush" width="80" />
            <el-table-column prop="predictedSemrush" label="校准预测" width="90" />
            <el-table-column prop="absError" label="朴素误差" width="90" />
            <el-table-column prop="modelAbsError" label="校准误差" width="90" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="summary?.modelReady" shadow="never" header="模型特征权重（v2 岭回归，按 |weight| 排序）">
      <p class="mb-2 text-xs text-gray-500">
        截距 {{ summary?.modelIntercept ?? "—" }} · 训练样本 {{ summary?.model?.trainSampleCount ?? summary?.model?.sampleCount ?? 0 }} ·
        缺词回填 {{ summary?.extractionMeta?.backfilledMissingKeywordCount ?? 0 }} 条
      </p>
      <el-table :data="summary?.featureWeights ?? []" size="small" max-height="320" empty-text="暂无模型">
        <el-table-column prop="label" label="特征" min-width="120" />
        <el-table-column prop="weight" label="权重" width="100">
          <template #default="{ row }">
            <span :class="row.weight >= 0 ? 'text-green-600' : 'text-red-600'">{{ row.weight }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="absWeight" label="|weight|" width="90" />
      </el-table>
    </el-card>

    <el-card
      v-if="(summary?.holdoutHighErrorAttribution?.length ?? 0) > 0"
      shadow="never"
      header="验证集高误差归因（校准误差 ≥0.4，Top 8）"
    >
      <el-table :data="summary?.holdoutHighErrorAttribution ?? []" size="small" row-key="snapshotId" empty-text="暂无高误差样本">
        <el-table-column type="expand">
          <template #default="{ row }">
            <ScoreCalibrationFeatureAttributionPanel
              :drivers="row.featureAttribution"
              :predicted-semrush="row.predictedSemrush"
              :semrush-overall="row.semrushOverall"
              :signed-model-error="row.signedModelError"
            />
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="140" show-overflow-tooltip />
        <el-table-column prop="predictedSemrush" label="预测" width="70" />
        <el-table-column prop="semrushOverall" label="Semrush" width="80" />
        <el-table-column prop="modelAbsError" label="误差" width="70" />
        <el-table-column label="主要归因" min-width="200">
          <template #default="{ row }">
            <span class="text-xs text-gray-600">{{ formatFeatureDrivers(row.topFeatureDrivers) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goJob(row.jobId)">任务</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <ScoreCalibrationShadowLogPanel ref="shadowLogRef" :project-id="effectiveProjectId" @open-job="goJob" />

    <el-card ref="pairsSectionRef" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">配对样本</span>
          <span class="text-xs text-gray-400">
            流程 RPA {{ summary?.extractionMeta?.workflowPairCount ?? 0 }} · 手动 {{ summary?.extractionMeta?.manualPairCount ?? 0 }} · 已排除 {{ summary?.extractionMeta?.excludedPairCount ?? 0 }}
          </span>
          <div class="flex flex-wrap items-center gap-2">
            <el-select v-model="filters.source" style="width: 120px" @change="reloadPairs">
              <el-option
                v-for="opt in scoreCalibrationPairSourceDict"
                :key="String(opt.value)"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select v-model="filters.dataset" style="width: 120px" @change="reloadPairs">
              <el-option
                v-for="opt in scoreCalibrationDatasetDict"
                :key="String(opt.value)"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-input-number v-model="filters.minModelAbsError" :min="0" :max="5" :step="0.1" controls-position="right" placeholder="最小校准误差" />
            <el-input-number v-model="filters.maxModelAbsError" :min="0" :max="5" :step="0.1" controls-position="right" placeholder="最大校准误差" />
            <el-button @click="reloadPairs">筛选</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="pairsLoading" :data="pairs" size="small" row-key="snapshotId" :empty-text="pairsEmptyText">
        <el-table-column type="expand">
          <template #default="{ row }">
            <ScoreCalibrationFeatureAttributionPanel
              :drivers="row.featureAttribution"
              :predicted-semrush="row.predictedSemrush"
              :semrush-overall="row.semrushOverall"
              :signed-model-error="row.signedModelError"
            />
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="targetKeyword" label="关键词" min-width="120" show-overflow-tooltip />
        <el-table-column prop="localScore" label="本地" width="70" />
        <el-table-column prop="semrushOverall" label="Semrush" width="80" />
        <el-table-column prop="predictedSemrush" label="预测" width="70" />
        <el-table-column prop="naiveAbsError" label="朴素误差" width="90" />
        <el-table-column prop="modelAbsError" label="校准误差" width="90" />
        <el-table-column label="标记" width="120">
          <template #default="{ row }">
            <el-tooltip v-if="!row.trainingEligible" content="旧评分规则样本：保留查看，但不参与当前模型训练" placement="top">
              <el-tag size="small" type="info" class="mr-1">旧版</el-tag>
            </el-tooltip>
            <el-tag v-if="row.isHoldout" size="small" type="warning" class="mr-1">验证</el-tag>
            <el-tag v-if="row.missingKeywordsBackfilled" size="small" type="info" class="mr-1">回填</el-tag>
            <el-tooltip v-if="row.possiblyOutlier && row.outlierReason" :content="row.outlierReason" placement="top">
              <el-tag size="small" type="danger">离群</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="归因" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="text-xs text-gray-600">{{ formatFeatureDrivers(row.topFeatureDrivers) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="置信度" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="dictTagType(scoreCalibrationConfidenceDict, row.confidence)">
              {{ dictLabel(scoreCalibrationConfidenceDict, row.confidence) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="110">
          <template #default="{ row }">
            {{ dictLabel(scoreSnapshotKindDict, row.snapshotKind) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goJob(row.jobId)">任务</el-button>
            <el-button
              v-if="filters.dataset !== 'excluded' && row.snapshotKind === 'semrush_check'"
              link
              type="danger"
              @click="handleSetPairExcluded(row.jobId, row.snapshotId, true)"
            >
              排除
            </el-button>
            <el-button
              v-if="filters.dataset === 'excluded'"
              link
              type="success"
              @click="handleSetPairExcluded(row.jobId, row.snapshotId, false)"
            >
              恢复
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-3 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          layout="total, prev, pager, next"
          :total="total"
          @current-change="loadPairs"
        />
      </div>
    </el-card>

    <el-card shadow="never" header="试算：本地分 + 校准预测">
      <el-form label-width="100px" class="max-w-3xl">
        <el-form-item label="目标关键词">
          <el-input v-model="predictForm.targetKeyword" placeholder="例如 magnesium for sleep" />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="predictForm.content" type="textarea" :rows="8" placeholder="粘贴 Markdown 正文" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="predicting" @click="handlePredict">计算预测分</el-button>
        </el-form-item>
      </el-form>

      <el-descriptions v-if="predictResult" :column="2" border size="small" class="max-w-3xl">
        <el-descriptions-item label="本地预检">{{ predictResult.localScore }}</el-descriptions-item>
        <el-descriptions-item label="本地/10">{{ predictResult.naiveMapped }}</el-descriptions-item>
        <el-descriptions-item label="校准预测 Semrush">{{ predictResult.predictedSemrush }}</el-descriptions-item>
        <el-descriptions-item label="置信度">
          {{ dictLabel(scoreCalibrationConfidenceDict, predictResult.confidence) }}
        </el-descriptions-item>
        <el-descriptions-item label="发布线">
          {{ predictResult.passed ? "已达" : `还差 ${predictResult.pointsToGo} 分` }}
        </el-descriptions-item>
        <el-descriptions-item label="当前重点">
          {{ predictResult.primaryNode.label }} · {{ predictResult.primaryNode.hint }}
        </el-descriptions-item>
      </el-descriptions>

      <ScoreCalibrationFeatureAttributionPanel
        v-if="predictResult?.featureAttribution.length"
        class="mt-3 max-w-3xl rounded border border-gray-100"
        :drivers="predictResult.featureAttribution"
        :predicted-semrush="predictResult.predictedSemrush"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import type { ElCard } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import {
  exportScoreCalibrationTrainingSet,
  getScoreCalibrationSummary,
  listScoreCalibrationPairs,
  predictCalibratedSemrushScore,
  setWorkflowPairCalibrationExcluded,
  type ScoreCalibrationPairItem,
  type ScoreCalibrationPredictResult,
  type ScoreCalibrationSummary,
  type ScoreCalibrationFeatureDriver
} from "@/api/seo-factory/score-calibration";
import {
  scoreCalibrationConfidenceDict,
  scoreCalibrationDatasetDict,
  scoreCalibrationPairSourceDict,
  scoreCalibrationReadinessDict,
  scoreSnapshotKindDict
} from "@/constants/dicts/score-calibration";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";
import { isPlatformOperatorUser } from "@/utils/platform-operator-access";
import { ElMessageBox } from "element-plus";
import ScoreCalibrationFeatureAttributionPanel from "./components/score-calibration/ScoreCalibrationFeatureAttributionPanel.vue";
import ScoreCalibrationManualImportPanel from "./components/score-calibration/ScoreCalibrationManualImportPanel.vue";
import ScoreReverseExperimentPanel from "./components/score-calibration/ScoreReverseExperimentPanel.vue";
import ScoreCalibrationMissingJobsPanel from "./components/score-calibration/ScoreCalibrationMissingJobsPanel.vue";
import ScoreCalibrationShadowLogPanel from "./components/score-calibration/ScoreCalibrationShadowLogPanel.vue";

defineOptions({ name: "ScoreCalibrationLabView" });

const props = withDefaults(
  defineProps<{
    projectId?: string;
    consoleMode?: boolean;
  }>(),
  { projectId: "", consoleMode: false }
);

const route = useRoute();
const router = useRouter();
const effectiveProjectId = computed(
  () => props.projectId || (route.params.projectId as string) || ""
);

const loading = ref(false);
const pairsLoading = ref(false);
const exporting = ref(false);
const predicting = ref(false);
const summary = ref<ScoreCalibrationSummary | null>(null);
const pairs = ref<ScoreCalibrationPairItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const filters = reactive<{
  dataset: "all" | "holdout" | "train" | "excluded";
  source: "all" | "workflow" | "manual";
  minModelAbsError?: number;
  maxModelAbsError?: number;
}>({ dataset: "all", source: "all" });
const pairsEmptyText = computed(() =>
  filters.dataset === "excluded"
    ? "暂无已排除的流程 RPA 样本"
    : "暂无同时含本地分与 Semrush 分的快照"
);
const predictForm = reactive({ targetKeyword: "", content: "" });
const predictResult = ref<ScoreCalibrationPredictResult | null>(null);
const pairsSectionRef = ref<InstanceType<typeof ElCard> | null>(null);
const missingJobsRef = ref<InstanceType<typeof ScoreCalibrationMissingJobsPanel> | null>(null);
const shadowLogRef = ref<InstanceType<typeof ScoreCalibrationShadowLogPanel> | null>(null);

type ReadinessActionKey =
  | "view_jobs"
  | "view_missing_jobs"
  | "filter_holdout_errors"
  | "open_settings";

interface ReadinessActionItem {
  key: ReadinessActionKey;
  label: string;
  buttonType: "primary" | "default" | "warning";
}

const statCards = computed(() => {
  const s = summary.value;
  if (!s) return [];
  const readinessLabel = dictLabel(scoreCalibrationReadinessDict, s.readiness.state);
  return [
    {
      label: "就绪状态",
      value: readinessLabel,
      hint: s.readiness.reduceRpaEffective
        ? "降频 RPA 已可生效"
        : s.readiness.canTrialReduceRpa
          ? "可试验降频，生产门控未达标"
          : readinessGapHint(s.readiness)
    },
    {
      label: "训练样本",
      value: s.snapshotCount,
      hint: `流程 RPA ${s.extractionMeta?.workflowPairCount ?? 0} · 手动 ${s.extractionMeta?.manualPairCount ?? 0} · ${s.jobCount} 任务有配对`
    },
    {
      label: "缺样本任务",
      value: s.coverage?.jobsWithoutTrainablePair ?? 0,
      hint: `${s.coverage?.jobsWithTrainablePair ?? 0}/${s.coverage?.totalJobs ?? 0} 任务已有真 RPA 配对`
    },
    {
      label: "验证集 MAE",
      value: s.holdoutReady ? s.holdoutMapping.mae : "—",
      hint: s.holdoutReady
        ? `${s.holdoutMapping.holdoutSampleCount} 条 · ${s.holdoutMapping.holdoutJobCount} 任务`
        : `至少 ${s.minJobsForHoldout} 任务做 holdout`
    },
    { label: "朴素 MAE（全量）", value: s.naiveMapping.mae, hint: "本地/10 直接对比" },
    {
      label: "朴素 MAE（验证集）",
      value: s.holdoutReady ? (s.holdoutNaiveMapping?.mae ?? "—") : "—",
      hint: "验证集上的朴素映射"
    },
    { label: "本地通过率", value: `${s.localPassRate}%`, hint: `门槛 ${s.passThresholds.local}` },
    {
      label: "影子日志",
      value: s.shadowStats?.totalEntries ?? 0,
      hint: `跳过 RPA ${s.shadowStats?.rpaSkippedCount ?? 0} 次`
    }
  ];
});

const readinessAlert = computed(() => {
  const s = summary.value;
  if (!s?.readiness) return null;
  const r = s.readiness;
  const stateLabel = dictLabel(scoreCalibrationReadinessDict, r.state);
  const base = `训练样本 ${s.snapshotCount} 条 · 验证 ${r.holdoutSampleCount} 条 · Holdout MAE ${r.holdoutMae ?? "—"}`;
  const actions = buildReadinessActions(r.primaryAction, s.coverage);

  switch (r.state) {
    case "production_ready":
      return {
        type: "success" as const,
        title: `就绪：${stateLabel}`,
        description: `${base}。可开启「降频 RPA」，优化轮将按门控跳过 RPA；流程结束仍做确认 RPA。`,
        actions
      };
    case "trial_ready":
      return {
        type: "warning" as const,
        title: `试验级：${stateLabel}`,
        description: `${base}。可谨慎试验降频，但生产门控（验证≥15、训练≥30、MAE≤0.35）未达标，运行时仍走 RPA。`,
        actions
      };
    case "holdout_unstable":
      return {
        type: "warning" as const,
        title: `验证集不稳定：${stateLabel}`,
        description: `${base}。需验证 ≥8 条且 MAE≤0.45；当前 MAE 已${r.holdoutMae !== null && r.holdoutMae <= 0.45 ? "达标" : "未达标"}，主要差验证条数。`,
        actions
      };
    case "shadow_only":
      return {
        type: "info" as const,
        title: `采集中：${stateLabel}`,
        description: `已有 ${s.snapshotCount} 条样本，但 holdout 未形成。需 ≥${s.minJobsForHoldout} 个任务且每任务有真 RPA 快照。`,
        actions
      };
    default:
      return {
        type: "info" as const,
        title: `样本不足：${stateLabel}`,
        description: `还需 ${r.gaps.samplesNeeded} 条样本、${r.gaps.jobsNeeded} 个任务。样本仅含真 RPA，每任务保留最新一条。`,
        actions
      };
  }
});

function buildReadinessActions(
  primaryAction: ScoreCalibrationSummary["readiness"]["primaryAction"],
  coverage: ScoreCalibrationSummary["coverage"] | undefined
): ReadinessActionItem[] {
  const actions: ReadinessActionItem[] = [];
  if (
    (primaryAction === "collect_rpa_samples" || primaryAction === "none") &&
    (coverage?.jobsWithoutTrainablePair ?? 0) > 0
  ) {
    actions.push({
      key: "view_missing_jobs",
      label: `查看缺样本任务（${coverage?.jobsWithoutTrainablePair ?? 0}）`,
      buttonType: "primary"
    });
  }
  if (primaryAction === "review_holdout_errors") {
    actions.push({
      key: "filter_holdout_errors",
      label: "筛选高误差验证样本",
      buttonType: "warning"
    });
  }
  if (
    primaryAction === "enable_reduce_rpa_trial" ||
    primaryAction === "enable_reduce_rpa_production"
  ) {
    actions.push({
      key: "open_settings",
      label: "前往设置开启降频 RPA",
      buttonType: "primary"
    });
  }
  if (actions.length === 0) {
    actions.push({ key: "view_jobs", label: "查看任务列表", buttonType: "default" });
  }
  return actions;
}

function readinessGapHint(r: ScoreCalibrationSummary["readiness"]): string {
  const parts: string[] = [];
  if (r.gaps.samplesNeeded > 0) parts.push(`样本 +${r.gaps.samplesNeeded}`);
  if (r.gaps.jobsNeeded > 0) parts.push(`任务 +${r.gaps.jobsNeeded}`);
  if (r.gaps.holdoutSamplesNeeded > 0) parts.push(`验证 +${r.gaps.holdoutSamplesNeeded}`);
  return parts.length > 0 ? parts.join(" · ") : "继续采集真 RPA 快照";
}

async function loadSummary() {
  loading.value = true;
  try {
    summary.value = await getScoreCalibrationSummary(effectiveProjectId.value);
  } finally {
    loading.value = false;
  }
}

async function loadPairs() {
  pairsLoading.value = true;
  try {
    const res = await listScoreCalibrationPairs(effectiveProjectId.value, {
      page: page.value,
      limit: limit.value,
      dataset: filters.dataset,
      source: filters.source,
      minModelAbsError: filters.minModelAbsError,
      maxModelAbsError: filters.maxModelAbsError
    });
    pairs.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? pairs.value.length;
  } finally {
    pairsLoading.value = false;
  }
}

function reloadPairs() {
  page.value = 1;
  void loadPairs();
}

async function handleExport() {
  exporting.value = true;
  try {
    const data = await exportScoreCalibrationTrainingSet(effectiveProjectId.value);
    const blob = new Blob([JSON.stringify(data.rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `score-calibration-${effectiveProjectId.value.slice(0, 8)}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    message(`已导出 ${data.rowCount} 条`, { type: "success" });
  } finally {
    exporting.value = false;
  }
}

async function handlePredict() {
  if (!predictForm.targetKeyword.trim() || !predictForm.content.trim()) {
    message("请填写关键词与正文", { type: "warning" });
    return;
  }
  predicting.value = true;
  try {
    predictResult.value = await predictCalibratedSemrushScore(effectiveProjectId.value, {
      targetKeyword: predictForm.targetKeyword.trim(),
      content: predictForm.content
    });
  } finally {
    predicting.value = false;
  }
}

function formatFeatureDrivers(drivers: ScoreCalibrationFeatureDriver[] | undefined): string {
  if (!drivers?.length) return "—";
  return drivers
    .map((driver) => {
      const arrow = driver.direction === "raises" ? "↑" : "↓";
      const value = Math.abs(driver.contribution).toFixed(2);
      return `${driver.label}${arrow}${value}`;
    })
    .join(" · ");
}

async function handleManualImported() {
  await loadSummary();
  reloadPairs();
  await missingJobsRef.value?.reload();
  await shadowLogRef.value?.reload();
}

function goSettings() {
  router.push({ name: "SeoFactorySettings", params: { projectId: effectiveProjectId.value } });
}

function goConsoleDiagnostics() {
  router.push({
    name: "ConsoleProjectDiagnostics",
    query: { projectId: effectiveProjectId.value }
  });
}

function goJobs() {
  router.push({ name: "SeoFactoryJobs", params: { projectId: effectiveProjectId.value } });
}

function handleReadinessAction(key: ReadinessActionKey) {
  if (key === "open_settings") {
    if (props.consoleMode) {
      goConsoleDiagnostics();
    } else {
      goSettings();
    }
    return;
  }
  if (key === "view_jobs" || key === "view_missing_jobs") {
    if (key === "view_missing_jobs") {
      missingJobsRef.value?.scrollIntoView();
      return;
    }
    const firstMissing = summary.value?.coverage?.sampleJobIdsWithoutPair?.[0];
    if (firstMissing) {
      goJob(firstMissing);
      return;
    }
    goJobs();
    return;
  }
  if (key === "filter_holdout_errors") {
    filters.dataset = "holdout";
    filters.source = "all";
    filters.minModelAbsError = 0.5;
    filters.maxModelAbsError = undefined;
    reloadPairs();
    pairsSectionRef.value?.$el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function goJob(jobId: string) {
  router.push({ name: "SeoFactoryJobDetail", params: { projectId: effectiveProjectId.value, jobId } });
}

async function handleSetPairExcluded(jobId: string, snapshotId: string, excluded: boolean) {
  const actionLabel = excluded ? "排除" : "恢复";
  try {
    await ElMessageBox.confirm(
      excluded
        ? "排除后该流程 RPA 样本不再参与模型训练，任务与检测记录保留，可在「已排除」中恢复。"
        : "恢复后该样本将重新纳入训练集。",
      `确认${actionLabel}`,
      {
        type: excluded ? "warning" : "info",
        confirmButtonText: actionLabel,
        cancelButtonText: "取消"
      }
    );
  } catch {
    return;
  }

  await setWorkflowPairCalibrationExcluded(effectiveProjectId.value, jobId, snapshotId, excluded);
  message(`样本已${actionLabel}`, { type: "success" });
  await loadSummary();
  await loadPairs();
}

watch(effectiveProjectId, (id) => {
  if (!id) return;
  void loadSummary();
  reloadPairs();
});

onMounted(() => {
  if (!props.consoleMode && !isPlatformOperatorUser()) {
    void router.replace({ path: "/error/403" });
    return;
  }
  if (!effectiveProjectId.value) return;
  void loadSummary();
  void loadPairs();
});
</script>
