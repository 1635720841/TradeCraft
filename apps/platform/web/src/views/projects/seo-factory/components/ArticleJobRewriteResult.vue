<!--
  AI 重写候选版本：变更摘要 + 采纳/放弃。

  边界：
  - 不负责：正文 diff（M2）
-->
<template>
  <el-alert type="info" :closable="false" class="mb-4">
    <template #title>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span>AI 已生成新版本，请对比后采纳或放弃</span>
        <div class="flex gap-2">
          <el-button type="primary" size="small" :loading="accepting" @click="emit('accept')">
            采纳新版本
          </el-button>
          <el-button size="small" :loading="discarding" @click="emit('discard')">
            放弃
          </el-button>
        </div>
      </div>
    </template>
  </el-alert>

  <el-descriptions v-if="candidate" :column="1" border class="mb-4">
    <el-descriptions-item label="模式">
      {{ modeLabel }}
    </el-descriptions-item>
    <el-descriptions-item v-if="candidate.instruction" label="指令">
      {{ candidate.instruction }}
    </el-descriptions-item>
    <el-descriptions-item label="生成时间">
      {{ formatTime(candidate.generatedAt) }}
    </el-descriptions-item>
    <el-descriptions-item label="Prompt">
      {{ candidate.promptVersion }}
    </el-descriptions-item>
  </el-descriptions>

  <div v-if="candidate?.changesSummary?.length" class="mb-4">
    <div class="mb-2 font-medium">变更摘要</div>
    <ul class="list-disc pl-5 space-y-1 text-sm">
      <li v-for="(line, i) in candidate.changesSummary" :key="i">{{ line }}</li>
    </ul>
  </div>

  <div v-if="candidate?.warnings?.length" class="mb-4">
    <div class="mb-2 font-medium text-amber-700">未落实 / 注意</div>
    <ul class="list-disc pl-5 space-y-1 text-sm text-amber-800">
      <li v-for="(line, i) in candidate.warnings" :key="i">{{ line }}</li>
    </ul>
  </div>

  <div v-if="candidate?.content?.trim()" class="mb-2 font-medium">候选正文预览</div>
  <div
    v-if="candidate?.content?.trim()"
    class="draft-preview rounded border border-blue-200 bg-blue-50/40 p-4"
  >
    <ArticleJobDraftHtmlBody :content="candidate.content" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobRewriteCandidate } from "@/api/seo-factory/types";
import ArticleJobDraftHtmlBody from "./ArticleJobDraftHtmlBody.vue";

defineOptions({ name: "ArticleJobRewriteResult" });

const props = defineProps<{
  candidate?: ArticleJobRewriteCandidate | null;
  accepting?: boolean;
  discarding?: boolean;
}>();

const emit = defineEmits<{
  accept: [];
  discard: [];
}>();

const modeLabel = computed(() =>
  props.candidate?.mode === "instruction" ? "定向改写" : "按建议优化"
);

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN");
}
</script>

<style scoped>
.draft-preview {
  line-height: 1.75;
}
</style>
