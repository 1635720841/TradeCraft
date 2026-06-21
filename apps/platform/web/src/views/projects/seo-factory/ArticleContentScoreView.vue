<!--
  内容评分独立页：粘贴关键词与正文，Semrush 式 0–10 分（不建任务、不跑 RPA）。

  边界：
  - 不负责：模型训练（评分校准实验室）
  - 不负责：任务改稿持久化（任务详情改稿侧栏）
-->
<template>
  <div class="space-y-4 p-4">
    <div>
      <h1 class="text-lg font-medium">内容评分</h1>
      <p class="text-sm text-gray-500">
        粘贴目标关键词与正文，秒级得到 0–10 分与优化建议（本地规则 + 项目校准模型）。
      </p>
    </div>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <el-card shadow="never">
          <el-form label-position="top">
            <el-form-item label="目标关键词">
              <el-input v-model="form.targetKeyword" placeholder="例如 magnesium for sleep" />
            </el-form-item>
            <el-form-item label="正文（Markdown）">
              <el-input v-model="form.content" type="textarea" :rows="16" placeholder="粘贴正文，至少 80 字符" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="loading" :disabled="!canScore" @click="handleScore">
                开始评分
              </el-button>
              <span v-if="!canScore" class="ml-2 text-xs text-gray-500">需填写关键词且正文 ≥ 80 字符</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="min-h-[320px]">
          <template #header>
            <span class="text-sm font-medium">评分结果</span>
          </template>
          <ArticleContentScoreResultDisplay v-if="result" :result="result" />
          <el-empty v-else description="填写左侧内容后点击「开始评分」" :image-size="72" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { normalizeArticleScoreContent } from "@wm/shared-core";
import { scoreArticleContentTrial, type ArticleContentScoreResult } from "@/api/seo-factory/article-score";
import ArticleContentScoreResultDisplay from "./components/score-calibration/ArticleContentScoreResultDisplay.vue";

defineOptions({ name: "ArticleContentScoreView" });

const route = useRoute();
const projectId = computed(() => route.params.projectId as string);

const form = reactive({ targetKeyword: "", content: "" });
const loading = ref(false);
const result = ref<Omit<ArticleContentScoreResult, "jobId" | "contentScore"> | null>(null);

const canScore = computed(
  () => form.targetKeyword.trim().length > 0 && form.content.trim().length >= 80
);

async function handleScore() {
  if (!canScore.value) return;
  loading.value = true;
  try {
    result.value = await scoreArticleContentTrial(projectId.value, {
      targetKeyword: form.targetKeyword.trim(),
      content: normalizeArticleScoreContent(form.content)
    });
  } finally {
    loading.value = false;
  }
}
</script>
