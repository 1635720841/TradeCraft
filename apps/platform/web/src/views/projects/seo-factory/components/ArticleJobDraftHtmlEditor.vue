<!--
  所见即所得正文编辑（contenteditable HTML，完整保留表格）。

  边界：
  - 不负责：保存 API（父组件处理）
  - 对外仍使用 Markdown 字符串
 -->
<template>
  <div class="draft-html-editor" :class="{ 'is-disabled': disabled }">
    <ArticleJobDraftEditorToolbar
      :disabled="disabled || imageUploading"
      :image-uploading="imageUploading"
      :image-selected="Boolean(selectedImageBlock)"
      :image-width-percent="selectedImageWidth"
      @action="handleToolbarAction"
    />
    <p v-if="!disabled" class="draft-html-editor__hint text-xs text-gray-400 px-3 py-1 border-x border-gray-200 bg-gray-50">
      选中图片后可放大/缩小、改 Alt、删除或拖拽；Ctrl+S 快速保存
    </p>
    <input
      ref="imageInputRef"
      type="file"
      class="sr-only"
      accept="image/jpeg,image/png,image/webp,image/gif"
      @change="handleImageFileChange"
    />
    <div
      ref="editorRef"
      class="draft-article-body draft-html-editor__surface"
      :contenteditable="disabled ? 'false' : 'true'"
      spellcheck="true"
      @input="handleInput"
      @keydown="handleKeydown"
    />

    <ArticleJobDraftImageUrlDialog v-model="imageUrlDialogOpen" @confirm="handleImageUrlConfirm" />
    <ArticleJobDraftImagePickDialog
      v-model="imagePickDialogOpen"
      :images="articleImages"
      @pick="handleImagePick"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { uploadArticleDraftImage } from "@/api/seo-factory/article-job";
import type { ArticleJobArticleImage } from "@/api/seo-factory/types";
import { htmlToMarkdown, markdownToHtml } from "@/utils/seo-factory/draft-content";
import { applyHtmlEditorAction, type HtmlEditorAction } from "@/utils/seo-factory/html-editor";
import {
  getSelectedDraftImageBlock,
  insertDraftImageIntoEditor,
  removeSelectedDraftImage,
  resizeSelectedDraftImage,
  saveEditorSelection,
  setupDraftImageInteractions,
  stabilizeDraftImages,
  updateSelectedDraftImageAlt
} from "@/utils/seo-factory/html-editor-image";
import { DRAFT_IMAGE_WIDTH_STEP, readImageWidthPercent } from "@/utils/seo-factory/draft-image-width";
import { stabilizeDraftTables } from "@/utils/seo-factory/quill-table-stabilize";
import { message } from "@/utils/message";
import ArticleJobDraftEditorToolbar from "./ArticleJobDraftEditorToolbar.vue";
import ArticleJobDraftImagePickDialog from "./ArticleJobDraftImagePickDialog.vue";
import ArticleJobDraftImageUrlDialog from "./ArticleJobDraftImageUrlDialog.vue";

defineOptions({ name: "ArticleJobDraftHtmlEditor" });

const props = defineProps<{
  markdown: string;
  projectId: string;
  jobId: string;
  articleImages?: ArticleJobArticleImage[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:markdown": [value: string];
  "quick-save": [];
}>();

const editorRef = ref<HTMLDivElement | null>(null);
const imageInputRef = ref<HTMLInputElement | null>(null);
const imageUploading = ref(false);
const imageUrlDialogOpen = ref(false);
const imagePickDialogOpen = ref(false);
const selectedImageBlock = ref<HTMLElement | null>(null);
const selectedImageWidth = ref<number | null>(null);
const pendingInsertRange = ref<Range | null>(null);
let lastEmittedMarkdown = "";
let isSyncingExternal = false;
let teardownImageInteractions: (() => void) | undefined;

function stabilizeEditorDom(root: ParentNode) {
  stabilizeDraftTables(root);
  stabilizeDraftImages(root);
}

function renderMarkdownIntoEditor(markdown: string) {
  const el = editorRef.value;
  if (!el) return;
  el.innerHTML = markdownToHtml(markdown);
  stabilizeEditorDom(el);
  selectedImageBlock.value = null;
  selectedImageWidth.value = null;
}

async function syncFromMarkdown(markdown: string) {
  isSyncingExternal = true;
  lastEmittedMarkdown = markdown;
  await nextTick();
  renderMarkdownIntoEditor(markdown);
  await nextTick();
  isSyncingExternal = false;
}

watch(
  () => props.markdown,
  (markdown) => {
    if (markdown === lastEmittedMarkdown) return;
    void syncFromMarkdown(markdown);
  },
  { immediate: true }
);

function onGlobalKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    emit("quick-save");
  }
}

onMounted(() => {
  if (props.markdown && editorRef.value && !editorRef.value.innerHTML.trim()) {
    void syncFromMarkdown(props.markdown);
  }
  if (editorRef.value) {
    teardownImageInteractions = setupDraftImageInteractions(editorRef.value, {
      onChange: handleInput,
      isDisabled: () => Boolean(props.disabled),
      onSelectionChange: (block) => {
        selectedImageBlock.value = block;
        if (block && editorRef.value) {
          const img = block.querySelector("img");
          selectedImageWidth.value = img ? readImageWidthPercent(img) : null;
        } else {
          selectedImageWidth.value = null;
        }
      }
    });
  }
  window.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
  teardownImageInteractions?.();
  window.removeEventListener("keydown", onGlobalKeydown);
});

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled || !editorRef.value) return;
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (!getSelectedDraftImageBlock(editorRef.value)) return;
  event.preventDefault();
  removeSelectedDraftImage(editorRef.value);
  selectedImageBlock.value = null;
  selectedImageWidth.value = null;
  handleInput();
}

function resizeSelectedImage(delta: number) {
  const editor = editorRef.value;
  if (!editor) return;
  const next = resizeSelectedDraftImage(editor, delta);
  if (next == null) {
    message("请先点击选中一张图片", { type: "warning" });
    return;
  }
  selectedImageWidth.value = next;
  handleInput();
}

function handleToolbarAction(action: HtmlEditorAction) {
  if (props.disabled || imageUploading.value) return;
  const editor = editorRef.value;
  if (!editor) return;

  if (action === "image") {
    pendingInsertRange.value = saveEditorSelection(editor);
    imageInputRef.value?.click();
    return;
  }
  if (action === "imageUrl") {
    pendingInsertRange.value = saveEditorSelection(editor);
    imageUrlDialogOpen.value = true;
    return;
  }
  if (action === "imagePick") {
    pendingInsertRange.value = saveEditorSelection(editor);
    imagePickDialogOpen.value = true;
    return;
  }
  if (action === "imageAlt") {
    const block = getSelectedDraftImageBlock(editor);
    const img = block?.querySelector("img");
    if (!img) {
      message("请先点击选中一张图片", { type: "warning" });
      return;
    }
    const alt = window.prompt("Alt 描述（SEO）", img.alt ?? "") ?? null;
    if (alt === null) return;
    updateSelectedDraftImageAlt(editor, alt);
    handleInput();
    return;
  }
  if (action === "imageDelete") {
    if (!removeSelectedDraftImage(editor)) {
      message("请先点击选中一张图片", { type: "warning" });
      return;
    }
    selectedImageBlock.value = null;
    selectedImageWidth.value = null;
    handleInput();
    return;
  }
  if (action === "imageSmaller") {
    resizeSelectedImage(-DRAFT_IMAGE_WIDTH_STEP);
    return;
  }
  if (action === "imageLarger") {
    resizeSelectedImage(DRAFT_IMAGE_WIDTH_STEP);
    return;
  }

  editor.focus();
  applyHtmlEditorAction(action);
  handleInput();
}

function insertImage(url: string, alt: string) {
  const editor = editorRef.value;
  if (!editor) return;
  insertDraftImageIntoEditor(editor, url, alt, pendingInsertRange.value);
  pendingInsertRange.value = null;
  handleInput();
}

function handleImageUrlConfirm(payload: { url: string; alt: string }) {
  insertImage(payload.url, payload.alt);
}

function handleImagePick(image: ArticleJobArticleImage) {
  imagePickDialogOpen.value = false;
  insertImage(image.url, image.alt);
}

async function handleImageFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const editor = editorRef.value;
  if (!file || props.disabled || !editor) return;

  const savedRange = pendingInsertRange.value;
  pendingInsertRange.value = null;

  imageUploading.value = true;
  try {
    const uploaded = await uploadArticleDraftImage(props.projectId, props.jobId, file);
    const alt = file.name.replace(/\.[^.]+$/, "");
    insertDraftImageIntoEditor(editor, uploaded.url, alt, savedRange);
    handleInput();
    message("图片已上传，可拖拽到合适位置", { type: "success" });
  } finally {
    imageUploading.value = false;
  }
}

function handleInput() {
  if (isSyncingExternal || !editorRef.value) return;
  stabilizeEditorDom(editorRef.value);
  const markdown = htmlToMarkdown(editorRef.value.innerHTML);
  if (markdown === lastEmittedMarkdown) return;
  lastEmittedMarkdown = markdown;
  emit("update:markdown", markdown);
}
</script>

<style scoped lang="scss">
.draft-html-editor {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
  background: #fff;
}

.draft-html-editor__hint {
  margin: 0;
  border-top: 0;
}

.draft-html-editor__surface {
  min-height: min(52vh, 640px);
  padding: 1rem 1.25rem;
  outline: none;
}

.draft-html-editor.is-disabled .draft-html-editor__surface {
  opacity: 0.65;
  cursor: not-allowed;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>

<style lang="scss">
@use "@/style/draft-article-body.scss";
</style>
