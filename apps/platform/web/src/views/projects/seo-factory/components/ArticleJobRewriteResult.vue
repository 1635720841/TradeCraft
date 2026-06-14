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

  <div v-if="previewBlocks.length" class="mb-2 font-medium">候选正文预览</div>
  <article
    v-if="previewBlocks.length"
    class="draft-preview rounded border border-blue-200 bg-blue-50/40 p-4"
  >
    <template v-for="(block, index) in previewBlocks" :key="index">
      <h2 v-if="block.type === 'h2'" class="draft-h2">{{ block.text }}</h2>
      <h3 v-else-if="block.type === 'h3'" class="draft-h3">{{ block.text }}</h3>
      <p v-else-if="block.type === 'p'" class="draft-p">{{ block.text }}</p>
      <ul v-else-if="block.type === 'ul' && block.items?.length" class="draft-ul">
        <li v-for="(item, i) in block.items" :key="i">{{ item }}</li>
      </ul>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobRewriteCandidate } from "@/api/seo-factory/types";
import { parseSimpleMarkdown } from "@/utils/seo-factory/parseSimpleMarkdown";

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

const previewBlocks = computed(() =>
  props.candidate?.content ? parseSimpleMarkdown(props.candidate.content) : []
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
  color: var(--el-text-color-primary);
}

.draft-h2 {
  margin: 1.25rem 0 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.draft-h2:first-child {
  margin-top: 0;
}

.draft-h3 {
  margin: 1rem 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.draft-p {
  margin: 0.5rem 0;
}

.draft-ul {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
  list-style-type: disc;
}

.draft-ul li {
  margin: 0.25rem 0;
}
</style>
