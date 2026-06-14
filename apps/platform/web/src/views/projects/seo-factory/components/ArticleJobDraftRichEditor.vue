<!--
  所见即所得正文编辑（Quill，交互对齐 Semrush 文章编辑器）。

  边界：
  - 不负责：保存 API（父组件处理）
  - 对外仍使用 Markdown 字符串（与后端 draftData.content 一致）
 -->
<template>
  <div class="draft-quill" :class="{ 'is-disabled': disabled }">
    <QuillEditor
      ref="quillRef"
      v-model:content="htmlContent"
      content-type="html"
      theme="snow"
      :read-only="disabled"
      :options="editorOptions"
      @ready="handleEditorReady"
      @update:content="handleHtmlUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import { htmlToMarkdown, markdownToHtml } from "@/utils/seo-factory/draft-content";
import {
  countHtmlTables,
  countMarkdownTables,
  mergeMarkdownPreservingTables
} from "@/utils/seo-factory/markdown-table";
import { stabilizeDraftTables } from "@/utils/seo-factory/quill-table-stabilize";

defineOptions({ name: "ArticleJobDraftRichEditor" });

const props = defineProps<{
  markdown: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:markdown": [value: string];
}>();

const quillRef = ref<InstanceType<typeof QuillEditor> | null>(null);

const editorOptions = {
  placeholder: "在此编辑正文，可直接设置标题、加粗、列表与链接…",
  modules: {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["blockquote", "link", "image"],
      ["clean"]
    ]
  }
};

const htmlContent = ref("<p><br></p>");
let lastEmittedMarkdown = "";
let isSyncingExternal = false;

function getEditorRoot(): HTMLElement | null {
  return quillRef.value?.getQuill()?.root ?? null;
}

function restoreTablesInEditor(markdown: string) {
  const root = getEditorRoot();
  if (!root) return;

  const expectedHtml = markdownToHtml(markdown);
  const expectedCount = countHtmlTables(expectedHtml);
  const actualCount = root.querySelectorAll("table").length;

  if (actualCount >= expectedCount) {
    stabilizeDraftTables(root);
    return;
  }

  root.innerHTML = expectedHtml;
  stabilizeDraftTables(root);
}

async function syncEditorFromMarkdown(markdown: string) {
  isSyncingExternal = true;
  htmlContent.value = markdownToHtml(markdown);
  lastEmittedMarkdown = markdown;
  await nextTick();
  await nextTick();
  restoreTablesInEditor(markdown);
  await nextTick();
  isSyncingExternal = false;
}

function handleEditorReady(quill: { root: HTMLElement }) {
  quill.root.classList.add("draft-article-body");
  restoreTablesInEditor(props.markdown);
}

watch(
  () => props.markdown,
  (markdown) => {
    if (markdown === lastEmittedMarkdown) return;
    void syncEditorFromMarkdown(markdown);
  },
  { immediate: true }
);

function handleHtmlUpdate(html: string) {
  if (isSyncingExternal) return;

  const root = getEditorRoot();
  if (root) {
    restoreTablesInEditor(lastEmittedMarkdown || props.markdown);
  }

  const rawMarkdown = htmlToMarkdown(root?.innerHTML ?? html);
  const markdown = mergeMarkdownPreservingTables(
    lastEmittedMarkdown || props.markdown,
    rawMarkdown
  );

  if (markdown === lastEmittedMarkdown) return;
  lastEmittedMarkdown = markdown;
  emit("update:markdown", markdown);
}
</script>

<style scoped lang="scss">
.draft-quill {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
  background: #fff;
}

.draft-quill :deep(.ql-toolbar.ql-snow) {
  border: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.draft-quill :deep(.ql-container.ql-snow) {
  border: none;
  font-size: 15px;
}

.draft-quill :deep(.ql-editor) {
  min-height: min(68vh, 760px);
  padding: 1rem 1.25rem;
}

.draft-quill :deep(.ql-editor .draft-table-wrap),
.draft-quill :deep(.ql-editor table) {
  display: block;
  visibility: visible;
  max-width: 100%;
}

.draft-quill.is-disabled :deep(.ql-toolbar),
.draft-quill.is-disabled :deep(.ql-editor) {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>

<style lang="scss">
@use "@/style/draft-article-body.scss";
</style>
