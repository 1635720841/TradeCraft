<!--
  表达润色（M7）结果：变更摘要、警告与润色前后对比。

  边界：
  - 不负责：触发润色（ArticleJobService / 工作流）
-->
<template>
  <div v-if="visible" class="mt-4 rounded border border-gray-200 bg-gray-50/60 p-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ PARAPHRASE_FEATURE_NAME }}</span>
          <el-tag :type="statusTagType" size="small">{{ statusLabel }}</el-tag>
        </div>
        <p class="text-xs text-gray-500">{{ PARAPHRASE_FEATURE_HINT }}</p>
      </div>
      <el-button
        v-if="canRerun"
        size="small"
        :loading="rerunning"
        @click="emit('rerun')"
      >
        {{ PARAPHRASE_BTN_RERUN }}
      </el-button>
    </div>

    <p v-if="summaryText" class="mb-3 text-sm text-gray-700">{{ summaryText }}</p>

    <div
      v-if="quillbot?.changesSummary?.length && !quillbot?.usedOriginal"
      class="mb-3"
    >
      <div class="mb-1 text-sm font-medium">变更摘要</div>
      <ul class="list-disc space-y-1 pl-5 text-sm text-gray-700">
        <li v-for="(line, index) in quillbot.changesSummary" :key="index">{{ line }}</li>
      </ul>
    </div>

    <div v-if="userWarnings.length" class="mb-3">
      <div class="mb-1 text-sm font-medium text-amber-700">注意</div>
      <ul class="list-disc space-y-1 pl-5 text-sm text-amber-800">
        <li v-for="(line, index) in userWarnings" :key="index">{{ line }}</li>
      </ul>
    </div>

    <el-collapse v-if="technicalWarnings.length" class="mb-2">
      <el-collapse-item title="查看跳过详情" name="technical">
        <ul class="list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li v-for="(line, index) in technicalWarnings" :key="index">{{ line }}</li>
        </ul>
      </el-collapse-item>
    </el-collapse>

    <el-collapse v-if="showCompare" class="mt-2">
      <el-collapse-item :title="PARAPHRASE_COMPARE_COLLAPSE" name="compare">
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="mb-2 text-sm font-medium text-gray-600">{{ PARAPHRASE_COMPARE_BEFORE }}</div>
            <div class="draft-preview rounded border bg-white p-3">
              <ArticleJobDraftHtmlBody :content="originalContent!" />
            </div>
          </div>
          <div>
            <div class="mb-2 text-sm font-medium text-gray-600">{{ PARAPHRASE_COMPARE_AFTER }}</div>
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
import {
  PARAPHRASE_BTN_RERUN,
  PARAPHRASE_COMPARE_AFTER,
  PARAPHRASE_COMPARE_BEFORE,
  PARAPHRASE_COMPARE_COLLAPSE,
  PARAPHRASE_FEATURE_HINT,
  PARAPHRASE_FEATURE_NAME,
  PARAPHRASE_SKIPPED_DEFAULT,
  PARAPHRASE_STATUS_DONE,
  PARAPHRASE_STATUS_INCOMPLETE,
  PARAPHRASE_STATUS_KEPT_ORIGINAL,
  PARAPHRASE_STATUS_SKIPPED,
  PARAPHRASE_STATUS_UNNEEDED,
  PARAPHRASE_SUMMARY_DONE,
  PARAPHRASE_SUMMARY_UNNEEDED,
  formatParaphraseSummaryUnneededChunks
} from "@wm/shared-core";
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

function isTechnicalWarning(line: string): boolean {
  return (
    line.includes("chunk_skipped:") ||
    line.includes("document_skipped:") ||
    line.includes("validate_skipped:") ||
    line.includes("paraphrase_partial:") ||
    line.startsWith("format_repaired:") ||
    line === "readability_repaired_before_save"
  );
}

const visible = computed(() => Boolean(props.quillbot?.completedAt || props.quillbot?.skipped));

const statusTagType = computed(() => {
  if (props.quillbot?.skipped) return "info";
  if (props.quillbot?.polishUnneeded) return "success";
  if (props.quillbot?.usedOriginal) return "warning";
  if (props.quillbot?.passed) return "success";
  return "info";
});

const statusLabel = computed(() => {
  if (props.quillbot?.skipped) return PARAPHRASE_STATUS_SKIPPED;
  if (props.quillbot?.polishUnneeded) return PARAPHRASE_STATUS_UNNEEDED;
  if (props.quillbot?.usedOriginal) return PARAPHRASE_STATUS_KEPT_ORIGINAL;
  if (props.quillbot?.passed) return PARAPHRASE_STATUS_DONE;
  return PARAPHRASE_STATUS_INCOMPLETE;
});

const summaryText = computed(() => {
  const quillbot = props.quillbot;
  if (!quillbot) return "";
  if (quillbot.skipped) return quillbot.warnings?.[0] ?? PARAPHRASE_SKIPPED_DEFAULT;
  if (quillbot.polishUnneeded) {
    const chunkCount = quillbot.chunkCount ?? 0;
    if (chunkCount > 1) {
      return formatParaphraseSummaryUnneededChunks(chunkCount);
    }
    return PARAPHRASE_SUMMARY_UNNEEDED;
  }
  if (quillbot.usedOriginal) {
    return "复检未通过，已保留 Semrush 优化稿。可查看下方警告了解原因。";
  }
  const parts: string[] = [];
  if (typeof quillbot.chunkCount === "number" && quillbot.chunkCount > 1) {
    parts.push(
      `分 ${quillbot.chunkCount} 段润色，成功 ${quillbot.chunksPolished ?? 0} 段。`
    );
  }
  if (quillbot.warnings?.some((line) => line.includes("paraphrase_partial:"))) {
    parts.push("部分段落润色未通过，已保留对应原段落。");
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
  return PARAPHRASE_SUMMARY_DONE;
});

const technicalWarnings = computed(() =>
  (props.quillbot?.warnings ?? []).filter((line) => isTechnicalWarning(line))
);

const userWarnings = computed(() => {
  if (props.quillbot?.polishUnneeded) return [];
  return (props.quillbot?.warnings ?? []).filter((line) => !isTechnicalWarning(line));
});

const showCompare = computed(
  () =>
    Boolean(props.originalContent?.trim()) &&
    Boolean(props.currentContent?.trim()) &&
    props.originalContent?.trim() !== props.currentContent?.trim() &&
    !props.quillbot?.skipped &&
    !props.quillbot?.usedOriginal &&
    !props.quillbot?.polishUnneeded
);
</script>

<style scoped>
.draft-preview {
  line-height: 1.75;
  max-height: 28rem;
  overflow: auto;
}
</style>
