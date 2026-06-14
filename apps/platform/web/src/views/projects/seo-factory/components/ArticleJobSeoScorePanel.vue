<!--
  SEO 评分展示：Semrush 终检（权威）+ 本地预检。

  边界：
  - 不负责：评分计算（后端 seo-checker 模块）
-->
<template>
  <div>
    <el-alert
      v-if="failedStepLabel"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      :title="`任务失败于「${failedStepLabel}」步骤`"
      description="点「续跑任务」将从该步骤继续，不会重头跑 SERP / 初稿。"
    />

    <el-alert
      v-if="localScoreStale || semrushScoreStale"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="评分已过期"
      description="稿件经手动编辑后，下方分数可能基于旧稿。请到「稿件正文」Tab 按发布清单重算本地 SEO 或重跑 Semrush。"
    />

    <el-alert
      v-if="hasData || canCheck"
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      :title="`评分流程：本地预检（规则对齐 Semrush）≥ ${LOCAL_SEO_PASS_THRESHOLD} 分 → Semrush 终检（权威分 ≥ ${SEMRUSH_PASS_THRESHOLD}）`"
    />

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-button
        type="primary"
        :loading="checking"
        :disabled="!canRunSemrushCheck || checking"
        @click="emit('run-semrush-check')"
      >
        Semrush 终检（当前文章）
      </el-button>
      <el-button v-if="checking" @click="emit('cancel-semrush-check')">
        取消 / 解除卡住
      </el-button>
      <el-button
        :disabled="!canRewrite || rewriting"
        :loading="rewriting"
        @click="emit('rewrite')"
      >
        AI 重写
      </el-button>
      <span v-if="!canCheck" class="text-sm text-gray-500">需先有初稿内容</span>
      <span v-else-if="semrushGateReason" class="text-sm text-amber-600">
        {{ semrushGateReason }}
      </span>
      <span v-else-if="checking && checkStale" class="text-sm text-amber-600">
        优化可能已中断（API 重启或队列卡住），请点「取消 / 解除卡住」后重试
      </span>
      <span v-else-if="checking && optimizingMessage" class="text-sm text-gray-500">
        {{ optimizingMessage }}
      </span>
      <span v-else-if="checking" class="text-sm text-gray-500">
        优化进行中，请稍候（本地 AI 优化 + Semrush 终检，约 5–20 分钟）…
      </span>
      <span v-else-if="rewriting" class="text-sm text-gray-500">AI 重写中，约 30–90 秒…</span>
      <span v-else-if="rewriteBlockedReason" class="text-sm text-amber-600">
        {{ rewriteBlockedReason }}
      </span>
    </div>

    <el-alert
      v-if="localNearMiss"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      :title="`本地预检 ${localScore} 分，距 ${LOCAL_SEO_PASS_THRESHOLD} 分还差 ${localPointsToGo} 分`"
      :description="localNearMissHint"
    />

    <el-alert
      v-if="semrushNearMiss"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      :title="`Semrush ${semrushScore} / 10，距 ${SEMRUSH_PASS_THRESHOLD} 还差 ${semrushPointsToGo} 分`"
      description="续跑任务将从上次 Semrush 分数继续优化，不会重跑本地预检。"
    />

    <el-descriptions v-if="hasData" :column="2" border>
      <el-descriptions-item label="Semrush 终检">
        <template v-if="semrushSkipped">
          <span class="text-gray-500">未启用（SEMRUSH_ENABLED）</span>
        </template>
        <template v-else-if="semrushScore != null">
          <el-tag :type="semrushTagType">{{ semrushScore }} / 10</el-tag>
          <el-tag v-if="semrushScoreStale" class="ml-2" type="warning" size="small" effect="plain">
            已过期
          </el-tag>
          <span class="ml-2 text-sm text-gray-500">
            通过线 {{ SEMRUSH_PASS_THRESHOLD }}（权威分）
          </span>
        </template>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="本地预检">
        <el-tag :type="localTagType">{{ localScore ?? "-" }} / 100</el-tag>
        <el-tag v-if="localScoreStale" class="ml-2" type="warning" size="small" effect="plain">
          已过期
        </el-tag>
        <el-tag
          v-if="localPassed === true"
          class="ml-2"
          type="success"
          size="small"
          effect="plain"
        >
          已通过
        </el-tag>
        <el-tag
          v-else-if="localPassed === false"
          class="ml-2"
          type="warning"
          size="small"
          effect="plain"
        >
          未通过
        </el-tag>
        <span v-if="localScore != null" class="ml-2 text-sm text-gray-500">
          门槛 {{ LOCAL_SEO_PASS_THRESHOLD }} 分 · 规则对齐 Semrush
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="semrushReadabilityScore != null"
        label="Semrush 可读性"
      >
        {{ semrushReadabilityScore }} / 100
        <span class="ml-2 text-sm text-gray-500">目标 ≥70</span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="semrushWordCountLabel"
        label="Semrush 词数"
      >
        {{ semrushWordCountLabel }}
      </el-descriptions-item>
      <el-descriptions-item v-if="submittedKeywords.length" label="提交关键词" :span="2">
        <el-tag
          v-for="kw in submittedKeywords"
          :key="kw"
          class="mr-1 mb-1"
          size="small"
        >
          {{ kw }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item v-if="semrushNode" label="3ue 节点">
        {{ semrushNode }}
      </el-descriptions-item>
      <el-descriptions-item v-if="analysisSource" label="建议来源">
        {{ analysisSourceLabel }}
      </el-descriptions-item>
      <el-descriptions-item v-if="optimizeRounds != null" label="本地优化轮次">
        {{ optimizeRounds }}
      </el-descriptions-item>
      <el-descriptions-item v-if="semrushOptimizeRounds != null" label="Semrush 优化轮次">
        {{ semrushOptimizeRounds }}
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics?.wordCount" label="词数">
        {{ metrics.wordCount }}
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics?.keywordDensity != null" label="关键词密度">
        {{ metrics.keywordDensity }}%
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics" label="SERP 词对齐">
        {{ metrics.matchedSerpTerms }} / {{ metrics.totalSerpTerms }}
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.longSentencesOver22 != null"
        label="超长句 (>22词)"
      >
        <span :class="readabilityMetricClass(metrics.longSentencesOver22, 2)">
          {{ metrics.longSentencesOver22 }} / ≤2
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.longParagraphsOver80 != null"
        label="超长段 (>80词)"
      >
        <span :class="readabilityMetricClass(metrics.longParagraphsOver80, 1)">
          {{ metrics.longParagraphsOver80 }} / ≤1
        </span>
      </el-descriptions-item>
      <el-descriptions-item
        v-if="metrics?.passiveVoiceHits != null"
        label="被动语态"
      >
        <span :class="readabilityMetricClass(metrics.passiveVoiceHits, 6)">
          {{ metrics.passiveVoiceHits }} / ≤6
        </span>
      </el-descriptions-item>
    </el-descriptions>

    <div v-if="breakdown" class="mt-4">
      <div class="mb-2 font-medium">本地预检明细（规则对齐 Semrush）</div>
      <el-row :gutter="12">
        <el-col v-for="item in breakdownItems" :key="item.key" :span="breakdownItems.length <= 4 ? 6 : 4">
          <el-card shadow="never" class="text-center">
            <div class="text-2xl font-semibold" :class="breakdownValueClass(item)">
              {{ item.value }}<span class="text-sm text-gray-400">/{{ item.max }}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">{{ item.label }}</div>
            <div v-if="item.gap > 0" class="text-xs text-amber-600 mt-0.5">−{{ item.gap }}</div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div v-if="localSuggestions.length" class="mt-4">
      <div class="mb-2 font-medium">本地评分建议</div>
      <ul class="list-disc pl-5 space-y-1 text-sm">
        <li v-for="(s, i) in localSuggestions" :key="i">{{ s }}</li>
      </ul>
    </div>

    <div v-if="semrushSuggestionSections.length" class="mt-4">
      <div class="mb-2 font-medium">Semrush 建议</div>
      <div
        v-for="section in semrushSuggestionSections"
        :key="section.key"
        class="mb-3"
      >
        <div class="text-sm font-medium text-gray-700">{{ section.label }}</div>
        <ul class="list-disc pl-5 space-y-1 text-sm mt-1">
          <li v-for="(s, i) in section.items" :key="i">{{ s }}</li>
        </ul>
      </div>
    </div>
    <div v-else-if="semrushSuggestions.length" class="mt-4">
      <div class="mb-2 font-medium">Semrush 建议</div>
      <ul class="list-disc pl-5 space-y-1 text-sm">
        <li v-for="(s, i) in semrushSuggestions" :key="i">{{ s }}</li>
      </ul>
    </div>

    <div v-if="optimizeScoreRows.length" class="mt-4">
      <div class="mb-2 font-medium">优化轮次评分</div>
      <el-table :data="optimizeScoreRows" size="small" border stripe>
        <el-table-column label="阶段" width="100">
          <template #default="{ row }">
            <el-tag :type="phaseTagType(row.phase)" size="small">
              {{ phaseLabel(row.phase) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="轮次" width="88" prop="roundLabel" />
        <el-table-column label="优化前" width="100">
          <template #default="{ row }">
            {{ formatRowScore(row, "before") }}
          </template>
        </el-table-column>
        <el-table-column label="优化后" width="100">
          <template #default="{ row }">
            <span :class="scoreDeltaClass(getRowDelta(row))">
              {{ formatRowScore(row, "after") }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="候选分" width="100">
          <template #default="{ row }">
            <span v-if="row.rolledBack && row.candidateScoreAfter != null" class="text-amber-600">
              {{ formatRoundScore(row.candidateScoreAfter, row.phase) }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="回滚" min-width="160">
          <template #default="{ row }">
            <template v-if="row.rolledBack">
              <el-tag type="warning" size="small" effect="plain">
                已回滚
              </el-tag>
              <div class="text-xs text-gray-500 mt-0.5">
                {{ formatRollbackReason(asOptimizeRow(row)) }}
              </div>
            </template>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="变化" width="88">
          <template #default="{ row }">
            <span v-if="getRowDelta(row) != null" :class="scoreDeltaClass(getRowDelta(row))">
              {{ formatDelta(getRowDelta(row)!) }}
            </span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="本地分" width="120">
          <template #default="{ row }">
            <span v-if="formatRowLocalScoreDetail(row)">{{ formatRowLocalScoreDetail(row) }}</span>
            <span v-else class="text-gray-400">-</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" min-width="140">
          <template #default="{ row }">
            <span class="text-xs text-gray-500">{{ formatRowTime(row) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="optimizeHistory.length" class="mt-4">
      <div class="mb-2 font-medium">AI 优化记录</div>
      <el-collapse v-model="activeOptimizePanels">
        <el-collapse-item
          v-for="item in optimizeHistory"
          :key="`${item.phase}-${item.round}-${item.optimizedAt}`"
          :name="`${item.phase}-${item.round}-${item.optimizedAt}`"
        >
          <template #title>
            <div class="flex flex-wrap items-center gap-2 pr-2">
              <el-tag :type="phaseTagType(item.phase)" size="small">
                {{ phaseLabel(item.phase) }}
              </el-tag>
              <span class="text-sm">
                {{ item.kind === "baseline" || item.round === 0
                  ? (item.phase === "local" ? "初稿" : "Semrush 初检")
                  : `第 ${item.round} 轮` }}
              </span>
              <el-tag
                v-if="item.scoreBefore != null || item.scoreAfter != null"
                size="small"
                effect="plain"
              >
                {{ formatRoundScore(item.scoreBefore, item.phase) }}
                →
                {{ formatRoundScore(item.scoreAfter, item.phase) }}
              </el-tag>
              <el-tag
                v-if="item.rolledBack"
                type="warning"
                size="small"
                effect="plain"
              >
                已回滚
              </el-tag>
              <span
                v-if="item.rolledBack && item.candidateScoreAfter != null"
                class="text-xs text-amber-600"
              >
                候选 {{ formatRoundScore(item.candidateScoreAfter, item.phase) }}
                → 保留 {{ formatRoundScore(item.scoreAfter, item.phase) }}
              </span>
              <span v-if="item.promptVersion" class="text-xs text-gray-500">
                {{ item.promptVersion }}
              </span>
              <span class="text-xs text-gray-400">{{ formatTime(item.optimizedAt) }}</span>
              <el-tag
                v-if="item.warnings?.length"
                type="warning"
                size="small"
                effect="plain"
              >
                {{ item.warnings.length }} 条未落实
              </el-tag>
            </div>
          </template>

          <div v-if="item.rolledBack" class="mb-3">
            <div class="text-sm font-medium text-gray-700 mb-1">回滚说明</div>
            <p class="text-sm text-gray-600">{{ formatRollbackDetail(item) }}</p>
          </div>

          <div v-if="item.breakdownAfter" class="mb-3">
            <div class="text-sm font-medium text-gray-700 mb-1">评分明细（优化后）</div>
            <div class="flex flex-wrap gap-2 text-xs">
              <el-tag size="small" type="info">关键词 {{ item.breakdownAfter.keywordCoverage }}</el-tag>
              <el-tag size="small" type="info">SERP {{ item.breakdownAfter.serpTermAlignment }}</el-tag>
              <el-tag size="small" type="info">结构 {{ item.breakdownAfter.structure }}</el-tag>
              <el-tag size="small" type="info">可读 {{ item.breakdownAfter.readability }}</el-tag>
              <el-tag size="small" type="info">深度 {{ item.breakdownAfter.contentDepth }}</el-tag>
            </div>
          </div>

          <div v-if="item.changesSummary?.length" class="mb-3">
            <div class="text-sm font-medium text-gray-700 mb-1">已落实</div>
            <ul class="list-disc pl-5 space-y-1 text-sm">
              <li v-for="(line, i) in item.changesSummary" :key="i">{{ line }}</li>
            </ul>
          </div>

          <div v-if="item.warnings?.length">
            <div class="text-sm font-medium text-amber-700 mb-1">未落实 / 注意</div>
            <ul class="list-disc pl-5 space-y-1 text-sm text-amber-800">
              <li v-for="(line, i) in item.warnings" :key="i">{{ line }}</li>
            </ul>
          </div>

          <p
            v-if="!item.changesSummary?.length && !item.warnings?.length"
            class="text-sm text-gray-500"
          >
            本轮未返回变更说明
          </p>
        </el-collapse-item>
      </el-collapse>
    </div>

    <el-empty
      v-if="!hasData && !canCheck"
      description="暂无 SEO 评分（任务尚未进入优化阶段）"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ArticleJobOptimizeRound,
  ArticleJobSeoCheckData
} from "@/api/seo-factory/types";
import {
  LOCAL_SEO_PASS_THRESHOLD,
  SEMRUSH_PASS_THRESHOLD
} from "@/constants/seo-factory";
import { workflowStepLabel } from "@/utils/seo-factory/workflow-progress";

defineOptions({ name: "ArticleJobSeoScorePanel" });

const props = defineProps<{
  localSeoScore?: number | null;
  semrushScore?: number | null;
  seoCheckData?: ArticleJobSeoCheckData | null;
  optimizeHistory?: ArticleJobOptimizeRound[] | null;
  localScoreStale?: boolean;
  semrushScoreStale?: boolean;
  canCheck?: boolean;
  checking?: boolean;
  checkStale?: boolean;
  optimizingMessage?: string;
  canRewrite?: boolean;
  rewriting?: boolean;
  rewriteBlockedReason?: string;
}>();

const emit = defineEmits<{
  "run-semrush-check": [];
  "cancel-semrush-check": [];
  rewrite: [];
}>();

const local = computed(() => props.seoCheckData?.local);
const semrush = computed(() => props.seoCheckData?.semrush);

const failedStepLabel = computed(() => {
  const step = props.seoCheckData?.workflow?.failedStep;
  return step ? workflowStepLabel(step) : null;
});

const localScore = computed(() => props.localSeoScore ?? local.value?.score ?? null);
const localPassed = computed(() => {
  if (local.value?.passed != null) return local.value.passed;
  if (localScore.value != null) return localScore.value >= LOCAL_SEO_PASS_THRESHOLD;
  return null;
});
const localPointsToGo = computed(() => {
  if (localScore.value == null || localScore.value >= LOCAL_SEO_PASS_THRESHOLD) return 0;
  return LOCAL_SEO_PASS_THRESHOLD - localScore.value;
});

const localNearMiss = computed(
  () => localPointsToGo.value > 0 && localPointsToGo.value <= 5 && localScore.value != null,
);

const localNearMissHint = computed(() => {
  const parts: string[] = [];
  const m = metrics.value;
  if (m?.longSentencesOver22 != null && m.longSentencesOver22 > 2) {
    parts.push(`超长句 ${m.longSentencesOver22} 条（须 ≤2）`);
  }
  if (m?.longParagraphsOver80 != null && m.longParagraphsOver80 > 1) {
    parts.push(`超长段 ${m.longParagraphsOver80} 段（须 ≤1）`);
  }
  if (m?.passiveVoiceHits != null && m.passiveVoiceHits > 6) {
    parts.push(`被动语态 ${m.passiveVoiceHits} 处（须 ≤6）`);
  }
  if (parts.length > 0) {
    return `优先修复：${parts.join("；")}。续跑任务将自动追加优化轮次。`;
  }
  return "请按下方「本地评分建议」逐项修复，或点「续跑任务」继续自动优化。";
});

const semrushScore = computed(() => props.semrushScore ?? semrush.value?.overall ?? null);

const semrushPointsToGo = computed(() => {
  if (semrushScore.value == null || semrushScore.value >= SEMRUSH_PASS_THRESHOLD) return 0;
  return Math.round((SEMRUSH_PASS_THRESHOLD - semrushScore.value) * 10) / 10;
});

const semrushNearMiss = computed(
  () =>
    !semrushSkipped.value &&
    semrushScore.value != null &&
    semrushScore.value >= 8 &&
    semrushScore.value < SEMRUSH_PASS_THRESHOLD,
);

const semrushSkipped = computed(() => semrush.value?.skipped === true);
const optimizeRounds = computed(() => local.value?.optimizeRounds);
const semrushOptimizeRounds = computed(() => semrush.value?.optimizeRounds);
const metrics = computed(() => local.value?.metrics);
const breakdown = computed(() => local.value?.breakdown);
const localSuggestions = computed(() => local.value?.suggestions ?? []);
const semrushSuggestions = computed(() => semrush.value?.suggestions ?? []);
const semrushNode = computed(
  () => semrush.value?.nodeLabel ?? semrush.value?.node ?? null,
);
const submittedKeywords = computed(() => semrush.value?.submittedKeywords ?? []);
const semrushReadabilityScore = computed(
  () => semrush.value?.semrushReadabilityScore ?? null
);
const semrushWordCountLabel = computed(() => {
  const current = semrush.value?.semrushCurrentWordCount;
  const competitor = semrush.value?.semrushCompetitorWordCount;
  if (current == null && competitor == null) return "";
  if (current != null && competitor != null) {
    return `当前 ${current} 词 · 竞品标杆 ${competitor} 词`;
  }
  if (current != null) return `当前约 ${current} 词`;
  return `竞品标杆约 ${competitor} 词`;
});
const analysisSource = computed(() => semrush.value?.analysisSource ?? null);
const analysisSourceLabel = computed(() => {
  const src = analysisSource.value;
  if (src === "api") return "Semrush 接口";
  if (src === "dom") return "页面侧栏";
  if (src === "mixed") return "接口 + 页面";
  return src ?? "-";
});

const semrushSuggestionSections = computed(() => {
  const details = semrush.value?.suggestionDetails;
  if (!details) return [];
  const sections = [
    { key: "readability", label: "可读性", items: details.readability ?? [] },
    { key: "seo", label: "SEO", items: details.seo ?? [] },
    { key: "tone", label: "语气", items: details.tone ?? [] },
    { key: "originality", label: "原创性", items: details.originality ?? [] },
  ];
  return sections.filter((s) => s.items.length > 0);
});

const optimizeHistory = computed(
  () => props.seoCheckData?.optimizeHistory ?? props.optimizeHistory ?? []
);

interface OptimizeScoreRow extends ArticleJobOptimizeRound {
  roundLabel: string;
  delta: number | null;
}

const optimizeScoreRows = computed((): OptimizeScoreRow[] =>
  optimizeHistory.value.map((item) => {
    const isBaseline = item.kind === "baseline" || item.round === 0;
    let roundLabel = "";
    if (isBaseline) {
      roundLabel = item.phase === "local" ? "初稿" : "Semrush 初检";
    } else {
      roundLabel = `第 ${item.round} 轮${item.rolledBack ? "（已回滚）" : ""}`;
    }
    const delta =
      item.scoreBefore != null && item.scoreAfter != null
        ? Math.round((item.scoreAfter - item.scoreBefore) * 10) / 10
        : null;
    return { ...item, roundLabel, delta };
  })
);

const activeOptimizePanels = ref<string[]>([]);

watch(
  optimizeHistory,
  (items) => {
    if (items.length > 0) {
      const latest = items[items.length - 1];
      activeOptimizePanels.value = [`${latest.phase}-${latest.round}-${latest.optimizedAt}`];
    }
  },
  { immediate: true }
);

const hasData = computed(
  () =>
    localScore.value != null ||
    props.seoCheckData != null ||
    optimizeHistory.value.length > 0
);
const canCheck = computed(() => props.canCheck ?? false);
const canRunSemrushCheck = computed(
  () => canCheck.value && localPassed.value === true
);
const semrushGateReason = computed(() => {
  if (!canCheck.value) return "";
  if (localScore.value == null) {
    return `须先完成本地预检（≥${LOCAL_SEO_PASS_THRESHOLD} 分）后方可 Semrush 终检`;
  }
  if (localPassed.value === false) {
    return `本地预检 ${localScore.value} 分，未达 ${LOCAL_SEO_PASS_THRESHOLD} 分，请按下方建议优化后再终检`;
  }
  return "";
});
const checking = computed(() => props.checking ?? false);
const checkStale = computed(() => props.checkStale ?? false);
const optimizingMessage = computed(() => props.optimizingMessage ?? "");
const canRewrite = computed(() => props.canRewrite ?? false);
const rewriting = computed(() => props.rewriting ?? false);
const rewriteBlockedReason = computed(() => props.rewriteBlockedReason ?? "");

function phaseLabel(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "本地 SEO" : "Semrush";
}

function phaseTagType(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "primary" : "success";
}

function formatRoundScore(
  score: number | null | undefined,
  phase: ArticleJobOptimizeRound["phase"]
) {
  if (score == null) return "-";
  return phase === "local" ? `${score} / 100` : `${score} / 10`;
}

function formatRollbackReason(row: ArticleJobOptimizeRound): string {
  if (row.phase === "local") {
    return "本地分未提升";
  }
  if (row.rollbackReason === "local_below_threshold") {
    return `本地分 ${row.candidateLocalScoreAfter ?? "?"} 低于保留门槛（允许 Semrush 提升时降 1 分）`;
  }
  if (row.rollbackReason === "both") {
    return `Semrush 未提升且本地分 ${row.candidateLocalScoreAfter ?? "?"} 未达 ${LOCAL_SEO_PASS_THRESHOLD}`;
  }
  return "Semrush 分未提升";
}

function formatRollbackDetail(item: ArticleJobOptimizeRound): string {
  if (!item.rolledBack || item.candidateScoreAfter == null) {
    return "本轮改稿未通过验收，已恢复历史最优稿。";
  }
  const kept = formatRoundScore(item.scoreAfter, item.phase);
  const candidate = formatRoundScore(item.candidateScoreAfter, item.phase);
  if (item.phase === "local") {
    return `AI 改稿后本地预检为 ${candidate}，未超过保留稿 ${kept}，已回滚。`;
  }
  const keptLocal =
    item.localScoreAfter != null ? `${item.localScoreAfter} / 100` : "—";
  const candidateLocal =
    item.candidateLocalScoreAfter != null
      ? `${item.candidateLocalScoreAfter} / 100`
      : "—";
  if (item.rollbackReason === "local_below_threshold") {
    return `Semrush 候选 ${candidate}，但本地分 ${candidateLocal} 低于保留门槛（Semrush 提升时最多允许降 1 分），已保留 Semrush ${kept}、本地 ${keptLocal} 的最优稿。`;
  }
  if (item.rollbackReason === "both") {
    return `Semrush 候选 ${candidate} 未提升，且本地分 ${candidateLocal} 低于门槛 ${LOCAL_SEO_PASS_THRESHOLD}，已保留 Semrush ${kept}、本地 ${keptLocal} 的最优稿。`;
  }
  return `Semrush 候选 ${candidate} 未超过保留稿 ${kept}（本地 ${candidateLocal}），已回滚。`;
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

function asOptimizeRow(row: unknown): ArticleJobOptimizeRound {
  return row as ArticleJobOptimizeRound;
}

function formatRowScore(row: unknown, which: "before" | "after") {
  const item = asOptimizeRow(row);
  return formatRoundScore(
    which === "before" ? item.scoreBefore : item.scoreAfter,
    item.phase,
  );
}

function formatRowLocalScoreDetail(row: unknown): string {
  const item = asOptimizeRow(row);
  if (item.phase === "semrush" && item.rolledBack && item.candidateLocalScoreAfter != null) {
    const kept = item.localScoreAfter != null ? `${item.localScoreAfter}` : "?";
    return `${item.candidateLocalScoreAfter}→${kept}`;
  }
  return item.localScoreAfter != null ? `${item.localScoreAfter}` : "";
}

function formatRowLocalScore(row: unknown) {
  const detail = formatRowLocalScoreDetail(row);
  return detail || "-";
}

function formatRowTime(row: unknown) {
  return formatTime(asOptimizeRow(row).optimizedAt);
}

function getRowDelta(row: unknown): number | null {
  const item = asOptimizeRow(row);
  if (item.scoreBefore == null || item.scoreAfter == null) return null;
  return Math.round((item.scoreAfter - item.scoreBefore) * 10) / 10;
}

function scoreDeltaClass(delta: number | null) {
  if (delta == null) return "";
  if (delta > 0) return "text-green-600 font-medium";
  if (delta < 0) return "text-red-600 font-medium";
  return "text-gray-500";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN");
}

function readabilityMetricClass(value: number, maxAllowed: number) {
  if (value <= maxAllowed) return "text-green-600";
  return "text-red-600 font-medium";
}

const localTagType = computed(() => {
  if (localScore.value == null) return "info";
  if (localScore.value >= LOCAL_SEO_PASS_THRESHOLD) return "success";
  if (localScore.value >= 60) return "warning";
  return "danger";
});

const semrushTagType = computed(() => {
  if (semrushScore.value == null) return "info";
  if (semrush.value?.passed === true || semrushScore.value >= SEMRUSH_PASS_THRESHOLD) {
    return "success";
  }
  if (semrushScore.value >= 8) return "warning";
  return "danger";
});

const BREAKDOWN_MAX: Record<string, number> = {
  keyword: 25,
  serp: 25,
  structure: 20,
  readability: 20,
  depth: 10,
};

function breakdownValueClass(item: { value: number; max: number }) {
  if (item.value >= item.max) return "text-green-600";
  if (item.max - item.value <= 6) return "text-amber-600";
  return "text-red-600";
}

const breakdownItems = computed(() => {
  const b = breakdown.value;
  if (!b) return [];
  const items = [
    { key: "keyword", label: "关键词", value: b.keywordCoverage, max: BREAKDOWN_MAX.keyword },
    { key: "serp", label: "SERP 词", value: b.serpTermAlignment, max: BREAKDOWN_MAX.serp },
    { key: "structure", label: "结构", value: b.structure, max: BREAKDOWN_MAX.structure },
    { key: "readability", label: "可读性", value: b.readability ?? 0, max: BREAKDOWN_MAX.readability },
    { key: "depth", label: "深度", value: b.contentDepth, max: BREAKDOWN_MAX.depth },
  ];
  return items
    .filter((item) => item.value != null)
    .map((item) => ({ ...item, gap: item.max - item.value }));
});
</script>
