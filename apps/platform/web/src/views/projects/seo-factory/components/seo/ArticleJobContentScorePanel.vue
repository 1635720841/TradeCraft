<!--
  改稿页内容评分侧栏：Semrush SWA 式总分 + 缺词/篇幅/建议。

  边界：
  - 不负责：Semrush RPA 终检
  - 不负责：正文编辑（ArticleJobDraftEditor）
-->
<template>
  <div class="content-score-panel rounded border border-gray-200 bg-white p-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="text-sm font-medium text-gray-800">内容评分</div>
      <el-button size="small" type="primary" :loading="loading" :disabled="!canScore" @click="handleScore">
        重新评分
      </el-button>
    </div>

    <p v-if="!canScore" class="mb-2 text-xs text-gray-500">正文至少 80 字符后可评分</p>
    <p v-else-if="scoreStale" class="mb-2 text-xs text-amber-600">正文已变更，上次评分可能已过期</p>

    <template v-if="result">
      <div class="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <div class="text-xs text-gray-500">总分</div>
          <div class="text-3xl font-semibold" :class="result.passed ? 'text-green-600' : 'text-amber-600'">
            {{ result.overall }}
            <span class="text-base font-normal text-gray-400">/ 10</span>
          </div>
        </div>
        <el-tag :type="result.passed ? 'success' : 'warning'" size="small">
          {{ result.passed ? "已达发布线" : `还差 ${result.pointsToGo} 分` }}
        </el-tag>
        <el-tag size="small" :type="dictTagType(scoreCalibrationConfidenceDict, result.confidence)">
          {{ dictLabel(scoreCalibrationConfidenceDict, result.confidence) }}置信
        </el-tag>
      </div>

      <el-alert
        class="mb-3"
        :type="result.passed ? 'success' : 'warning'"
        :closable="false"
        show-icon
        :title="`当前重点：${result.primaryNode.label}`"
        :description="result.primaryNode.hint"
      />

      <el-descriptions :column="1" border size="small" class="mb-3">
        <el-descriptions-item label="词数">
          {{ result.wordCount.current }}
          <template v-if="result.wordCount.competitor">
            / 标杆 {{ result.wordCount.competitor }}
            <span v-if="result.wordCount.gap && result.wordCount.gap > 0" class="text-amber-600">
              （差 {{ result.wordCount.gap }}）
            </span>
          </template>
          <span v-else-if="result.wordCount.current"> 词</span>
        </el-descriptions-item>
        <el-descriptions-item label="缺词">
          <span v-if="result.missingKeywordCount === 0">无</span>
          <span v-else-if="result.missingKeywords.length">{{ result.missingKeywords.join("、") }}</span>
          <span v-else>{{ result.missingKeywordCount }} 个</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="result.readability" label="可读性">
          Flesch {{ result.readability.flesch ?? "—" }} · 长句 {{ result.readability.longSentencesOver22 }} · 长段
          {{ result.readability.longParagraphsOver65 }}
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="result.suggestions.length" class="text-sm">
        <div class="mb-1 font-medium text-gray-700">优化建议</div>
        <ul class="list-disc space-y-1 pl-5 text-gray-600">
          <li v-for="(item, index) in result.suggestions" :key="index">{{ item }}</li>
        </ul>
      </div>

      <p v-if="result.usedFallback" class="mt-2 text-xs text-gray-400">
        校准样本不足，当前为本地规则估算分；积累真 RPA 样本后可更贴近 Semrush。
      </p>

      <el-collapse v-if="result.featureAttribution?.length" class="mt-3">
        <el-collapse-item title="分数归因（高级）" name="attribution">
          <ScoreCalibrationFeatureAttributionPanel
            :drivers="result.featureAttribution"
            :predicted-semrush="result.overall"
          />
        </el-collapse-item>
      </el-collapse>
    </template>

    <el-empty v-else-if="!loading" description="点击「重新评分」查看当前正文得分" :image-size="56" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { hashArticleContentFingerprint } from "@wm/shared-core";
import {
  scoreArticleJobContent,
  type ArticleContentScoreResult
} from "@/api/seo-factory/article-score";
import type { ArticleJobContentScoreSnapshot } from "@/api/seo-factory/types";
import { scoreCalibrationConfidenceDict } from "@/constants/dicts/score-calibration";
import { dictLabel, dictTagType } from "@/utils/dict";
import ScoreCalibrationFeatureAttributionPanel from "../score-calibration/ScoreCalibrationFeatureAttributionPanel.vue";

defineOptions({ name: "ArticleJobContentScorePanel" });

type PanelResult = ArticleContentScoreResult & {
  readability?: ArticleContentScoreResult["readability"];
  featureAttribution?: ArticleContentScoreResult["featureAttribution"];
};

const props = defineProps<{
  projectId: string;
  jobId: string;
  content: string;
  canScore?: boolean;
  savedSnapshot?: ArticleJobContentScoreSnapshot | null;
}>();

const emit = defineEmits<{
  scored: [];
}>();

const loading = ref(false);
const result = ref<PanelResult | null>(null);

const canScore = computed(() => props.canScore !== false && props.content.trim().length >= 80);

const scoreStale = computed(() => {
  if (!result.value?.contentScore && !props.savedSnapshot) return false;
  const hash = hashArticleContentFingerprint(props.content);
  const snapshotHash = result.value?.contentScore?.contentHash ?? props.savedSnapshot?.contentHash;
  return Boolean(snapshotHash && snapshotHash !== hash);
});

function hydrateFromSnapshot(snapshot: ArticleJobContentScoreSnapshot): PanelResult {
  return {
    jobId: props.jobId,
    targetKeyword: "",
    contentScore: snapshot,
    overall: snapshot.overall,
    passed: snapshot.passed,
    passThreshold: snapshot.passThreshold,
    pointsToGo: snapshot.pointsToGo,
    confidence: snapshot.confidence,
    modelReady: snapshot.modelReady,
    usedFallback: snapshot.usedFallback,
    evalMae: null,
    localScore: snapshot.localScore,
    localBreakdown: {
      keywordCoverage: 0,
      serpTermAlignment: 0,
      structure: 0,
      readability: 0,
      contentDepth: 0
    },
    primaryNode: snapshot.primaryNode,
    missingKeywords: [],
    missingKeywordCount: snapshot.missingKeywordCount,
    wordCount: { current: 0, competitor: null, gap: null },
    suggestions: [],
    recommendedKeywords: [],
    featureAttribution: []
  };
}

function tryHydrateSaved() {
  if (!props.savedSnapshot) return;
  if (props.savedSnapshot.contentHash !== hashArticleContentFingerprint(props.content)) return;
  result.value = hydrateFromSnapshot(props.savedSnapshot);
}

async function handleScore() {
  if (!canScore.value) return;
  loading.value = true;
  try {
    result.value = await scoreArticleJobContent(props.projectId, props.jobId, {
      content: props.content
    });
    emit("scored");
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.jobId,
  () => {
    result.value = null;
    tryHydrateSaved();
  },
  { immediate: true }
);

watch(
  () => props.savedSnapshot,
  () => {
    if (!result.value) tryHydrateSaved();
  }
);
</script>
