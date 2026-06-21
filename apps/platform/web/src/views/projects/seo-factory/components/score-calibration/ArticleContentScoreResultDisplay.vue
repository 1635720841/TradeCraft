<!--
  内容评分结果展示（改稿侧栏 / 独立试算页共用）。

  边界：
  - 不负责：API 请求
  - 不负责：正文编辑
-->
<template>
  <div>
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
      <el-descriptions-item label="本地预检">{{ result.localScore }} 分</el-descriptions-item>
      <el-descriptions-item label="词数">
        {{ result.wordCount.current }}
        <template v-if="result.wordCount.competitor">
          / 标杆 {{ result.wordCount.competitor }}
          <span v-if="result.wordCount.gap && result.wordCount.gap > 0" class="text-amber-600">
            （差 {{ result.wordCount.gap }}）
          </span>
        </template>
      </el-descriptions-item>
      <el-descriptions-item label="缺词">
        <span v-if="result.missingKeywordCount === 0">无</span>
        <span v-else>{{ result.missingKeywords.join("、") || `${result.missingKeywordCount} 个` }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="可读性">
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

    <el-collapse v-if="result.featureAttribution.length" class="mt-3">
      <el-collapse-item title="分数归因（高级）" name="attribution">
        <ScoreCalibrationFeatureAttributionPanel
          :drivers="result.featureAttribution"
          :predicted-semrush="result.overall"
        />
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import type { ArticleContentScoreResult } from "@/api/seo-factory/article-score";
import { scoreCalibrationConfidenceDict } from "@/constants/dicts/score-calibration";
import { dictLabel, dictTagType } from "@/utils/dict";
import ScoreCalibrationFeatureAttributionPanel from "./ScoreCalibrationFeatureAttributionPanel.vue";

defineOptions({ name: "ArticleContentScoreResultDisplay" });

defineProps<{
  result: ArticleContentScoreResult | Omit<ArticleContentScoreResult, "jobId" | "contentScore">;
}>();
</script>
