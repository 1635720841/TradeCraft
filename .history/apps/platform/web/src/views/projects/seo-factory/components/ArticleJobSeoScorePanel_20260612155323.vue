<!--
  SEO 评分展示：Semrush 终检（权威）+ 本地预检。

  边界：
  - 不负责：评分计算（后端 seo-checker 模块）
-->
<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <el-button
        type="primary"
        :loading="checking"
        :disabled="!canCheck || checking"
        @click="emit('run-semrush-check')"
      >
        Semrush 检测当前文章
      </el-button>
      <el-button v-if="checking" @click="emit('cancel-semrush-check')">
        取消检测
      </el-button>
      <el-button
        :disabled="!canRewrite || rewriting"
        :loading="rewriting"
        @click="emit('rewrite')"
      >
        AI 重写
      </el-button>
      <span v-if="!canCheck" class="text-sm text-gray-500">需先有初稿内容</span>
      <span v-else-if="checking && checkStale" class="text-sm text-amber-600">
        检测可能已中断（后端已停止？），可点「取消检测」后重试
      </span>
      <span v-else-if="checking" class="text-sm text-gray-500">
        正在通过 3ue 共享号检测，约 1–2 分钟…
      </span>
      <span v-else-if="rewriting" class="text-sm text-gray-500">AI 重写中，约 30–90 秒…</span>
      <span v-else-if="rewriteBlockedReason" class="text-sm text-amber-600">
        {{ rewriteBlockedReason }}
      </span>
    </div>

    <el-descriptions v-if="hasData" :column="2" border>
      <el-descriptions-item label="Semrush 终检">
        <template v-if="semrushSkipped">
          <span class="text-gray-500">未启用（SEMRUSH_ENABLED）</span>
        </template>
        <template v-else-if="semrushScore != null">
          <el-tag :type="semrushTagType">{{ semrushScore }} / 10</el-tag>
          <span class="ml-2 text-sm text-gray-500">
            通过线 {{ SEMRUSH_PASS_THRESHOLD }}（权威分）
          </span>
        </template>
        <span v-else>-</span>
      </el-descriptions-item>
      <el-descriptions-item label="本地预检">
        <el-tag :type="localTagType">{{ localScore ?? "-" }} / 100</el-tag>
        <span v-if="localScore != null" class="ml-2 text-sm text-gray-500">
          门槛 {{ LOCAL_SEO_PASS_THRESHOLD }} 分（对齐 Semrush 规则）
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
      <el-descriptions-item v-if="metrics?.wordCount" label="词数">
        {{ metrics.wordCount }}
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics?.keywordDensity != null" label="关键词密度">
        {{ metrics.keywordDensity }}%
      </el-descriptions-item>
      <el-descriptions-item v-if="metrics" label="SERP 词对齐">
        {{ metrics.matchedSerpTerms }} / {{ metrics.totalSerpTerms }}
      </el-descriptions-item>
    </el-descriptions>

    <div v-if="breakdown" class="mt-4">
      <div class="mb-2 font-medium">本地预检明细（规则对齐 Semrush）</div>
      <el-row :gutter="12">
        <el-col v-for="item in breakdownItems" :key="item.key" :span="breakdownItems.length <= 4 ? 6 : 4">
          <el-card shadow="never" class="text-center">
            <div class="text-2xl font-semibold">{{ item.value }}</div>
            <div class="text-xs text-gray-500 mt-1">{{ item.label }}</div>
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
              <span class="text-sm">第 {{ item.round }} 轮</span>
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

defineOptions({ name: "ArticleJobSeoScorePanel" });

const props = defineProps<{
  localSeoScore?: number | null;
  semrushScore?: number | null;
  seoCheckData?: ArticleJobSeoCheckData | null;
  optimizeHistory?: ArticleJobOptimizeRound[] | null;
  canCheck?: boolean;
  checking?: boolean;
  checkStale?: boolean;
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

const localScore = computed(() => props.localSeoScore ?? local.value?.score ?? null);
const semrushScore = computed(() => props.semrushScore ?? null);
const semrushSkipped = computed(() => semrush.value?.skipped === true);
const optimizeRounds = computed(() => local.value?.optimizeRounds);
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
const checking = computed(() => props.checking ?? false);
const checkStale = computed(() => props.checkStale ?? false);
const canRewrite = computed(() => props.canRewrite ?? false);
const rewriting = computed(() => props.rewriting ?? false);
const rewriteBlockedReason = computed(() => props.rewriteBlockedReason ?? "");

function phaseLabel(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "本地 SEO" : "Semrush";
}

function phaseTagType(phase: ArticleJobOptimizeRound["phase"]) {
  return phase === "local" ? "primary" : "success";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN");
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

const breakdownItems = computed(() => {
  const b = breakdown.value;
  if (!b) return [];
  const items = [
    { key: "keyword", label: "关键词", value: b.keywordCoverage },
    { key: "serp", label: "SERP 词", value: b.serpTermAlignment },
    { key: "structure", label: "结构", value: b.structure },
    { key: "readability", label: "可读性", value: b.readability },
    { key: "depth", label: "深度", value: b.contentDepth }
  ];
  return items.filter((item) => item.value != null);
});
</script>
