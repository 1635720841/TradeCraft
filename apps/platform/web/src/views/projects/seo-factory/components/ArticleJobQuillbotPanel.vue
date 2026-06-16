<!--
  原创表达优化（M7）结果：变更摘要、警告与润色前后对比。

  边界：
  - 不负责：触发润色（ArticleJobService / 工作流）
-->
<template>
  <div v-if="visible" class="mt-4 rounded border border-gray-200 bg-gray-50/60 p-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="font-medium">原创表达优化</span>
        <el-tag :type="statusTagType" size="small">{{ statusLabel }}</el-tag>
      </div>
      <el-button
        v-if="canRerun"
        size="small"
        :loading="rerunning"
        @click="emit('rerun')"
      >
        重新润色
      </el-button>
    </div>

    <p v-if="summaryText" class="mb-3 text-sm text-gray-700">{{ summaryText }}</p>

    <div v-if="quillbot?.changesSummary?.length" class="mb-3">
      <div class="mb-1 text-sm font-medium">变更摘要</div>
      <ul class="list-disc space-y-1 pl-5 text-sm text-gray-700">
        <li v-for="(line, index) in quillbot.changesSummary" :key="index">{{ line }}</li>
      </ul>
    </div>

    <div v-if="quillbot?.warnings?.length" class="mb-3">
      <div class="mb-1 text-sm font-medium text-amber-700">注意</div>
      <ul class="list-disc space-y-1 pl-5 text-sm text-amber-800">
        <li v-for="(line, index) in quillbot.warnings" :key="index">{{ line }}</li>
      </ul>
    </div>

    <el-collapse v-if="showCompare" class="mt-2">
      <el-collapse-item title="查看润色前后对比" name="compare">
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="mb-2 text-sm font-medium text-gray-600">润色前（Semrush 优化稿）</div>
            <div class="draft-preview rounded border bg-white p-3">
              <ArticleJobDraftHtmlBody :content="originalContent!" />
            </div>
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-gray-600">润色后（当前正文）</div>
            <div class="draft-preview rounded border border-emerald-200 bg-emerald-50/40 p-3">
              <ArticleJobDraftHtmlBody :content="currentContent!" />
            </div>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobQuillbotResult } from "@/api/seo-factory/types";
import ArticleJobDraftHtmlBody from "./ArticleJobDraftHtmlBody.vue";

defineOptions({ name: "ArticleJobQuillbotPanel" });

const props = defineProps<{
  quillbot?: ArticleJobQuillbotResult | null;
  originalContent?: string | null;
  currentContent?: string | null;
  canRerun?: boolean;
  rerunning?: boolean;
}>();

const emit = defineEmits<{
  rerun: [];
}>();

const visible = computed(() => Boolean(props.quillbot?.completedAt || props.quillbot?.skipped));

const statusTagType = computed(() => {
  if (props.quillbot?.skipped) return "info";
  if (props.quillbot?.usedOriginal) return "warning";
  if (props.quillbot?.passed) return "success";
  return "info";
});

const statusLabel = computed(() => {
  if (props.quillbot?.skipped) return "已跳过";
  if (props.quillbot?.usedOriginal) return "已保留原稿";
  if (props.quillbot?.passed) return "已完成";
  return "未完成";
});

const summaryText = computed(() => {
  const quillbot = props.quillbot;
  if (!quillbot) return "";
  if (quillbot.skipped) return quillbot.warnings?.[0] ?? "已跳过原创表达优化";
  if (quillbot.usedOriginal) {
    return "复检未通过，已保留 Semrush 优化稿。可查看下方警告了解原因。";
  }
  const parts: string[] = [];
  if (typeof quillbot.chunkCount === "number" && quillbot.chunkCount > 1) {
    parts.push(
      `分 ${quillbot.chunkCount} 段润色，成功 ${quillbot.chunksPolished ?? 0} 段。`
    );
  }
  if (
    typeof quillbot.localScoreBefore === "number" &&
    typeof quillbot.localScoreAfter === "number"
  ) {
    parts.push(`本地预检 ${quillbot.localScoreBefore}→${quillbot.localScoreAfter} 分。`);
  }
  if (typeof quillbot.protectedTermCount === "number" && quillbot.protectedTermCount > 0) {
    parts.push(`已保护 ${quillbot.protectedTermCount} 个术语/规格。`);
  }
  if (parts.length > 0) return parts.join(" ");
  return "已完成句式润色，结构与 SEO 目标保持不变。";
});

const showCompare = computed(
  () =>
    Boolean(props.originalContent?.trim()) &&
    Boolean(props.currentContent?.trim()) &&
    props.originalContent?.trim() !== props.currentContent?.trim() &&
    !props.quillbot?.skipped &&
    !props.quillbot?.usedOriginal
);
</script>

<style scoped>
.draft-preview {
  line-height: 1.75;
  max-height: 28rem;
  overflow: auto;
}
</style>
