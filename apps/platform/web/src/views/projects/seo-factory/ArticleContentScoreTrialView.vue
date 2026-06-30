<!--
  文章内容评分（管理端独立页）：无任务上下文，Semrush SWA 式试算。

  边界：
  - 不负责：模型训练（评分校准实验室）
  - 不负责：运营改稿持久化（任务改稿侧栏）
-->
<template>
  <div class="space-y-4 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <el-button v-if="!consoleMode" link type="primary" @click="goSettings">← 返回项目配置</el-button>
        <el-button v-else link type="primary" @click="goConsoleDiagnostics">← 返回项目诊断</el-button>
        <h1 class="mt-1 text-lg font-medium">内容评分</h1>
        <p class="text-sm text-gray-500">
          在左侧从 Semrush 正文区复制后直接 Ctrl+V 粘贴，秒级得到 0–10 分（与改稿页同一套算法，不跑 RPA）。
        </p>
      </div>
      <el-button plain @click="goScoreLab">评分校准实验室</el-button>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never">
          <template #header>输入</template>
          <el-form label-position="top">
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
              <el-input-number
                v-model="form.targetWordCount"
                :min="0"
                :max="10000"
                :step="50"
                controls-position="right"
                placeholder="侧栏目标词数，如 887"
                class="w-full"
              />
              <p class="mt-1 text-xs text-gray-500">不填则按 SWA 规则推断（当前词数 × 1.15）；填 Semrush 侧栏「目标词数」更准</p>
            </el-form-item>
            <el-button type="primary" :loading="loading" :disabled="!canScore" @click="handleScore">
              计算评分
            </el-button>
            <span v-if="!canScore" class="ml-2 text-xs text-gray-500">需填写关键词且正文 ≥ 80 字符</span>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="h-full">
          <template #header>评分结果</template>
          <template v-if="result">
            <div class="mb-3 flex flex-wrap items-end gap-3">
              <div>
                <div class="text-xs text-gray-500">总分</div>
                <div
                  class="text-3xl font-semibold"
                  :class="result.passed ? 'text-green-600' : 'text-amber-600'"
                >
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
              <el-descriptions-item label="检测词">
                <span v-if="scoredKeywords.length">{{ scoredKeywords.join("、") }}</span>
                <span v-else class="text-gray-400">—</span>
              </el-descriptions-item>
              <el-descriptions-item label="缺词">
                <span v-if="result.missingKeywordCount === 0">无</span>
                <span v-else>{{ result.missingKeywords.join("、") }}</span>
              </el-descriptions-item>
            </el-descriptions>

            <div v-if="result.suggestions.length" class="mb-3 text-sm">
              <div class="mb-1 font-medium text-gray-700">优化建议</div>
              <ul class="list-disc space-y-1 pl-5 text-gray-600">
                <li v-for="(item, index) in result.suggestions" :key="index">{{ item }}</li>
              </ul>
            </div>

            <el-collapse v-if="result.featureAttribution.length">
              <el-collapse-item title="分数归因（高级）" name="attribution">
                <ScoreCalibrationFeatureAttributionPanel
                  :drivers="result.featureAttribution"
                  :predicted-semrush="result.overall"
                />
              </el-collapse-item>
            </el-collapse>

            <p v-if="result.usedFallback" class="mt-2 text-xs text-gray-400">
              校准样本不足，当前为本地规则估算分；可在实验室积累 RPA 配对样本。
            </p>
          </template>
          <el-empty v-else description="填写左侧内容后点击「计算评分」" :image-size="72" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { normalizeArticleScoreContent, parseTargetKeywordsInput } from "@wm/shared-core";
import { scoreArticleContentTrial, type ArticleContentScoreResult } from "@/api/seo-factory/article-score";
import { scoreCalibrationConfidenceDict } from "@/constants/dicts/score-calibration";
import { dictLabel, dictTagType } from "@/utils/dict";
import ScoreCalibrationFeatureAttributionPanel from "./components/score-calibration/ScoreCalibrationFeatureAttributionPanel.vue";
import ArticleContentPasteEditor from "./components/seo/ArticleContentPasteEditor.vue";
import { isPlatformOperatorUser } from "@/utils/platform-operator-access";

defineOptions({ name: "ArticleContentScoreTrialView" });

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

const form = reactive({
  targetKeywordsText: "",
  content: "",
  targetWordCount: undefined as number | undefined
});
const loading = ref(false);
const result = ref<Omit<ArticleContentScoreResult, "jobId" | "contentScore"> | null>(null);
const scoredKeywords = ref<string[]>([]);

const parsedKeywords = computed(() => parseTargetKeywordsInput(form.targetKeywordsText));

const canScore = computed(
  () => parsedKeywords.value.length > 0 && form.content.trim().length >= 80
);

async function handleScore() {
  if (!canScore.value) return;
  const keywordList = parsedKeywords.value;
  loading.value = true;
  try {
    result.value = await scoreArticleContentTrial(effectiveProjectId.value, {
      targetKeyword: keywordList[0],
      submittedKeywords: keywordList,
      content: normalizeArticleScoreContent(form.content),
      targetWordCount: form.targetWordCount
    });
    scoredKeywords.value = keywordList;
  } finally {
    loading.value = false;
  }
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

function goScoreLab() {
  if (props.consoleMode) {
    router.push({
      name: "ConsoleScoreLab",
      query: { projectId: effectiveProjectId.value }
    });
    return;
  }
  router.push({ name: "SeoFactoryScoreLab", params: { projectId: effectiveProjectId.value } });
}

onMounted(() => {
  if (!props.consoleMode && !isPlatformOperatorUser()) {
    void router.replace({ path: "/error/403" });
  }
});
</script>
