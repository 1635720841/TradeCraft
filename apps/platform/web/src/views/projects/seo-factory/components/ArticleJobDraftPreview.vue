<!--
  初稿 Markdown 预览：解析常见标题与列表并渲染。

  边界：
  - 不负责：完整 Markdown 语法（代码块、表格等）
-->
<template>
  <div>
    <div v-if="draft" class="mb-4 flex flex-wrap items-center gap-2">
      <el-button
        type="primary"
        :disabled="!canRewrite || rewriting"
        :loading="rewriting"
        @click="emit('rewrite')"
      >
        AI 重写
      </el-button>
      <span v-if="!canRewrite" class="text-sm text-gray-500">需先有初稿内容</span>
      <span v-else-if="rewriting" class="text-sm text-gray-500">AI 重写中，约 30–90 秒…</span>
      <span v-else-if="rewriteBlockedReason" class="text-sm text-amber-600">
        {{ rewriteBlockedReason }}
      </span>
    </div>

    <template v-if="draft">
      <el-descriptions v-if="metaTitle || metaDescription" :column="1" border class="mb-4">
        <el-descriptions-item v-if="metaTitle" label="标题">
          {{ metaTitle }}
        </el-descriptions-item>
        <el-descriptions-item v-if="metaDescription" label="Meta Description">
          {{ metaDescription }}
        </el-descriptions-item>
        <el-descriptions-item v-if="promptVersion" label="Prompt 版本">
          {{ promptVersion }}
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="showCurrentLabel" class="mb-2 text-sm font-medium text-gray-600">当前版本</div>

      <article v-if="blocks.length" class="draft-preview rounded border border-gray-200 bg-gray-50 p-4">
        <template v-for="(block, index) in blocks" :key="index">
          <h2 v-if="block.type === 'h2'" class="draft-h2">{{ block.text }}</h2>
          <h3 v-else-if="block.type === 'h3'" class="draft-h3">{{ block.text }}</h3>
          <p v-else-if="block.type === 'p'" class="draft-p">
            <InlineMarkdownText :text="block.text ?? ''" />
          </p>
          <figure v-else-if="block.type === 'img' && block.src" class="draft-figure">
            <img
              :src="block.src"
              :alt="block.alt ?? ''"
              class="draft-img"
              loading="lazy"
            />
            <figcaption v-if="block.alt" class="draft-caption">{{ block.alt }}</figcaption>
          </figure>
          <ul v-else-if="block.type === 'ul' && block.items?.length" class="draft-ul">
            <li v-for="(item, i) in block.items" :key="i">
              <InlineMarkdownText :text="item" />
            </li>
          </ul>
        </template>
      </article>

      <el-empty v-else description="初稿正文为空" />
    </template>

    <el-empty v-else description="暂无初稿（尚未进入撰写阶段）" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobDraftData } from "@/api/seo-factory/types";
import { parseSimpleMarkdown } from "@/utils/seo-factory/parseSimpleMarkdown";
import InlineMarkdownText from "./InlineMarkdownText.vue";

defineOptions({ name: "ArticleJobDraftPreview" });

const props = defineProps<{
  draftData?: ArticleJobDraftData | null;
  canRewrite?: boolean;
  rewriting?: boolean;
  rewriteBlockedReason?: string;
  showCurrentLabel?: boolean;
}>();

const emit = defineEmits<{
  rewrite: [];
}>();

const draft = computed(() => props.draftData);
const metaTitle = computed(() => draft.value?.title);
const metaDescription = computed(() => draft.value?.metaDescription);
const promptVersion = computed(() => draft.value?.promptVersion);
const blocks = computed(() =>
  draft.value?.content ? parseSimpleMarkdown(draft.value.content) : []
);
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

.draft-figure {
  margin: 1rem 0;
}

.draft-img {
  display: block;
  max-width: 100%;
  border-radius: 0.375rem;
  border: 1px solid var(--el-border-color-lighter);
}

.draft-caption {
  margin-top: 0.35rem;
  font-size: 0.875rem;
  color: var(--el-text-color-secondary);
}
</style>
