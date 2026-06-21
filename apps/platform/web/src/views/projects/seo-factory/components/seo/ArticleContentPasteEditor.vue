<!--
  内容评分粘贴区：拦截 Semrush HTML 粘贴并转为可评分 Markdown。

  边界：
  - 不负责：评分 API（父组件）
  - 不负责：TipTap 存库（改稿页用 ArticleJobDraftTipTapEditor）
-->
<template>
  <div class="content-paste-editor">
    <p class="content-paste-editor__hint text-xs text-gray-500">
      从 Semrush 正文区复制后在此 <kbd>Ctrl+V</kbd> 粘贴（自动保留标题/段落结构）；下方为转换后的正文。
    </p>
    <el-input
      :model-value="modelValue"
      type="textarea"
      :rows="16"
      placeholder="粘贴 Semrush 正文，或直接输入…"
      class="content-paste-editor__textarea"
      @update:model-value="emit('update:modelValue', $event)"
      @paste="handlePaste"
    />
    <div v-if="modelValue.trim()" class="content-paste-editor__preview">
      <div class="mb-1 text-xs font-medium text-gray-500">格式预览</div>
      <div class="content-paste-editor__preview-body rounded border border-gray-100 bg-gray-50 p-3">
        <ArticleJobDraftHtmlBody :content="modelValue" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from "vue";
import { normalizeArticleScoreContent } from "@wm/shared-core";
import { htmlToMarkdown } from "@/utils/seo-factory/draft-content";
import ArticleJobDraftHtmlBody from "../ArticleJobDraftHtmlBody.vue";

defineOptions({ name: "ArticleContentPasteEditor" });

defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function handlePaste(event: ClipboardEvent) {
  const html = event.clipboardData?.getData("text/html")?.trim();
  if (!html) return;

  event.preventDefault();
  const markdown = normalizeArticleScoreContent(htmlToMarkdown(html) || html);
  if (!markdown) return;

  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;

  const start = target.selectionStart;
  const end = target.selectionEnd;
  const before = target.value.slice(0, start);
  const after = target.value.slice(end);
  emit("update:modelValue", `${before}${markdown}${after}`);

  const cursor = before.length + markdown.length;
  void nextTick(() => {
    target.focus();
    target.setSelectionRange(cursor, cursor);
  });
}
</script>

<style scoped>
.content-paste-editor__hint {
  margin: 0 0 8px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px 4px 0 0;
  background: var(--el-fill-color-light);
}

.content-paste-editor__hint kbd {
  padding: 0 4px;
  font-size: 11px;
  border: 1px solid var(--el-border-color);
  border-radius: 3px;
  background: #fff;
}

.content-paste-editor__textarea :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.content-paste-editor__preview {
  margin-top: 12px;
}

.content-paste-editor__preview-body {
  max-height: 240px;
  overflow-y: auto;
}
</style>
