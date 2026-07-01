<!--
  TipTap 所见即所得正文编辑（Markdown 存库）。

  边界：
  - 不负责：保存 API（父组件处理）
 -->
<template>
  <div class="draft-tiptap-editor" :class="{ 'is-disabled': disabled }">
    <ArticleJobDraftTipTapToolbar
      :editor="editor ?? undefined"
      :disabled="disabled || imageUploading"
      :image-uploading="imageUploading"
      @upload-image="imageInputRef?.click()"
      @image-url="imageUrlDialogOpen = true"
      @image-pick="imagePickDialogOpen = true"
      @image-alt="handleImageAlt"
    />
    <p v-if="!disabled" class="draft-tiptap-editor__hint text-xs text-gray-400 px-3 py-1 border-x border-gray-200 bg-gray-50">
      拖拽图片边角可缩放；点击表格单元格显示悬浮操作栏；Ctrl+S 快速保存
    </p>
    <input
      ref="imageInputRef"
      type="file"
      class="sr-only"
      accept="image/jpeg,image/png,image/webp,image/gif"
      @change="handleImageFileChange"
    />
    <EditorContent :editor="editor" class="draft-tiptap-editor__content" />
    <ArticleJobDraftTipTapTableBubble
      v-if="editor"
      :editor="editor"
      :disabled="disabled || imageUploading"
    />

    <ArticleJobDraftImageUrlDialog v-model="imageUrlDialogOpen" @confirm="insertImageUrl" />
    <ArticleJobDraftImagePickDialog
      v-model="imagePickDialogOpen"
      :images="articleImages"
      @pick="handleImagePick"
    />
  </div>
</template>

<script setup lang="ts">
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import ImageResize from "tiptap-extension-resize-image";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { uploadMediaAsset } from "@/api/platform/media";
import type { ArticleJobArticleImage } from "@/api/seo-factory/types";
import { htmlToMarkdown, markdownToHtml } from "@/utils/seo-factory/draft-content";
import { prepareHtmlForTipTap } from "@/utils/seo-factory/draft-tiptap-html";
import { message } from "@/utils/message";
import ArticleJobDraftImagePickDialog from "./ArticleJobDraftImagePickDialog.vue";
import ArticleJobDraftImageUrlDialog from "./ArticleJobDraftImageUrlDialog.vue";
import ArticleJobDraftTipTapTableBubble from "./ArticleJobDraftTipTapTableBubble.vue";
import ArticleJobDraftTipTapToolbar from "./ArticleJobDraftTipTapToolbar.vue";

defineOptions({ name: "ArticleJobDraftTipTapEditor" });

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

const imageInputRef = ref<HTMLInputElement | null>(null);
const imageUploading = ref(false);
const imageUrlDialogOpen = ref(false);
const imagePickDialogOpen = ref(false);
let lastEmittedMarkdown = props.markdown;
let isSyncingExternal = false;

const editor = useEditor({
  content: prepareHtmlForTipTap(markdownToHtml(props.markdown)),
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] }
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https"
    }),
    ImageResize.configure({
      inline: false,
      allowBase64: false
    }),
    TableKit.configure({
      table: {
        resizable: true,
        HTMLAttributes: { class: "draft-table" }
      }
    }),
    Placeholder.configure({
      placeholder: "在此编辑正文，可直接设置标题、加粗、列表、表格与图片…"
    })
  ],
  editorProps: {
    attributes: {
      class: "draft-article-body draft-tiptap-editor__surface"
    }
  },
  onUpdate: ({ editor: ed }) => {
    if (isSyncingExternal) return;
    const markdown = htmlToMarkdown(ed.getHTML());
    if (markdown === lastEmittedMarkdown) return;
    lastEmittedMarkdown = markdown;
    emit("update:markdown", markdown);
  }
});

function syncFromMarkdown(markdown: string) {
  if (!editor.value) return;
  isSyncingExternal = true;
  lastEmittedMarkdown = markdown;
  editor.value.commands.setContent(prepareHtmlForTipTap(markdownToHtml(markdown)), {
    emitUpdate: false
  });
  isSyncingExternal = false;
}

watch(
  () => props.markdown,
  (markdown) => {
    if (markdown === lastEmittedMarkdown) return;
    syncFromMarkdown(markdown);
  }
);

watch(
  () => props.disabled,
  (disabled) => {
    editor.value?.setEditable(!disabled);
  }
);

function onGlobalKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    emit("quick-save");
  }
}

onMounted(() => {
  window.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  editor.value?.destroy();
});

function insertImage(url: string, alt: string) {
  editor.value
    ?.chain()
    .focus()
    .setImage({ src: url.trim(), alt: alt.trim() })
    .run();
}

function insertImageUrl(payload: { url: string; alt: string }) {
  insertImage(payload.url, payload.alt);
}

function handleImagePick(image: ArticleJobArticleImage) {
  imagePickDialogOpen.value = false;
  insertImage(image.url, image.alt);
}

function handleImageAlt() {
  const ed = editor.value;
  if (!ed?.isActive("imageResize")) {
    message("请先选中一张图片", { type: "warning" });
    return;
  }
  const prev = (ed.getAttributes("imageResize").alt as string | undefined) ?? "";
  const alt = window.prompt("Alt 描述（SEO）", prev) ?? null;
  if (alt === null) return;
  ed.chain().focus().updateAttributes("imageResize", { alt: alt.trim() }).run();
}

async function handleImageFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || props.disabled) return;

  imageUploading.value = true;
  try {
    const uploaded = await uploadMediaAsset(props.projectId, file);
    const alt = file.name.replace(/\.[^.]+$/, "");
    insertImage(uploaded.url, alt);
    message("图片已上传", { type: "success" });
  } finally {
    imageUploading.value = false;
  }
}
</script>

<style scoped lang="scss">
.draft-tiptap-editor {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  overflow: hidden;
  background: #fff;
}

.draft-tiptap-editor__hint {
  margin: 0;
  border-top: 0;
}

.draft-tiptap-editor__content :deep(.draft-tiptap-editor__surface) {
  min-height: min(52vh, 640px);
  padding: 1rem 1.25rem;
  outline: none;
}

.draft-tiptap-editor.is-disabled :deep(.draft-tiptap-editor__surface) {
  opacity: 0.65;
  cursor: not-allowed;
}

.draft-tiptap-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: var(--el-text-color-placeholder);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
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

.draft-tiptap-editor .ProseMirror-selectednode img {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 3px;
}

.draft-tiptap-editor .ProseMirror table:has(.selectedCell),
.draft-tiptap-editor .ProseMirror table.ProseMirror-selectednode {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--el-color-primary-light-8);
}
</style>
