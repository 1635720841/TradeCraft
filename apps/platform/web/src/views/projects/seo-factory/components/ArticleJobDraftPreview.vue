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
      <el-descriptions :column="1" border class="mb-4">
        <el-descriptions-item label="标题">
          {{ metaTitle || "（未填写）" }}
        </el-descriptions-item>
        <el-descriptions-item label="Meta Description">
          {{ metaDescription || "（未填写）" }}
        </el-descriptions-item>
        <el-descriptions-item v-if="promptVersion" label="Prompt 版本">
          {{ promptVersion }}
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="showCurrentLabel" class="mb-2 text-sm font-medium text-gray-600">当前版本</div>

      <div
        v-if="draft.content?.trim()"
        class="draft-preview rounded border border-gray-200 bg-gray-50 p-4"
      >
        <ArticleJobDraftHtmlBody :content="draft.content" />
      </div>

      <el-empty v-else description="初稿正文为空" />
    </template>

    <el-empty v-else description="暂无初稿（尚未进入撰写阶段）" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ArticleJobBriefData, ArticleJobDraftData } from "@/api/seo-factory/types";
import { resolveDraftTitleAndMeta } from "@/utils/seo-factory/draft-edit-preview";
import ArticleJobDraftHtmlBody from "./ArticleJobDraftHtmlBody.vue";

defineOptions({ name: "ArticleJobDraftPreview" });

const props = defineProps<{
  draftData?: ArticleJobDraftData | null;
  briefData?: ArticleJobBriefData | null;
  canRewrite?: boolean;
  rewriting?: boolean;
  rewriteBlockedReason?: string;
  showCurrentLabel?: boolean;
}>();

const emit = defineEmits<{
  rewrite: [];
}>();

const draft = computed(() => props.draftData);
const resolvedMeta = computed(() => resolveDraftTitleAndMeta(props.draftData, props.briefData));
const metaTitle = computed(() => resolvedMeta.value.title);
const metaDescription = computed(() => resolvedMeta.value.metaDescription);
const promptVersion = computed(() => draft.value?.promptVersion);
</script>

<style scoped>
.draft-preview {
  line-height: 1.75;
}
</style>
