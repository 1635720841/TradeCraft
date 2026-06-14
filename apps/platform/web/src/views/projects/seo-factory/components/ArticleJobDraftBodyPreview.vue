<!--
  稿件正文 Markdown 实时预览（编辑分屏 / 统一 HTML 渲染）。

  边界：
  - 不负责：编辑交互
 -->
<template>
  <div v-if="content?.trim()" class="draft-body-preview rounded border border-gray-200 bg-gray-50 p-4">
    <ArticleJobDraftHtmlBody :content="content" />
  </div>
  <el-empty v-else description="正文为空" :image-size="48" />
</template>

<script setup lang="ts">
import ArticleJobDraftHtmlBody from "./ArticleJobDraftHtmlBody.vue";

defineOptions({ name: "ArticleJobDraftBodyPreview" });

defineProps<{
  content?: string;
}>();
</script>
