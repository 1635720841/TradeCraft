<!--
  行内 Markdown 文本：渲染 [锚文本](url) 为链接。
-->
<template>
  <span>
    <template v-for="(segment, index) in segments" :key="index">
      <el-link
        v-if="segment.type === 'link' && segment.href"
        :href="segment.href"
        target="_blank"
        type="primary"
      >
        {{ segment.text }}
      </el-link>
      <span v-else>{{ segment.text }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { parseInlineMarkdown } from "@/utils/seo-factory/parseInlineMarkdown";

defineOptions({ name: "InlineMarkdownText" });

const props = defineProps<{
  text: string;
}>();

const segments = computed(() => parseInlineMarkdown(props.text));
</script>
