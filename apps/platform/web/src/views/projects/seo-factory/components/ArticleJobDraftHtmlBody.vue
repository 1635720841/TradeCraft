<!--
  稿件正文 HTML 渲染：与编辑/导出共用 markdownToHtml。

  边界：
  - 不负责：编辑交互
 -->
<template>
  <article class="draft-article-body" v-html="bodyHtml" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { markdownToHtml } from "@/utils/seo-factory/draft-content";

defineOptions({ name: "ArticleJobDraftHtmlBody" });

const props = defineProps<{
  content?: string;
}>();

const bodyHtml = computed(() => markdownToHtml(props.content ?? ""));
</script>

<style lang="scss">
@use "@/style/draft-article-body.scss";
</style>
