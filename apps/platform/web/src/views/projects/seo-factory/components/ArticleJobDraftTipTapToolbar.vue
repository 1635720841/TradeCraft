<!--
  TipTap 稿件正文工具栏。
 -->
<template>
  <div
    v-if="editor"
    class="draft-tiptap-toolbar flex flex-wrap items-center gap-1 border border-b-0 border-gray-200 bg-gray-50 px-2 py-1.5"
  >
    <el-button
      v-for="item in textItems"
      :key="item.key"
      size="small"
      :disabled="disabled"
      :type="item.active?.() ? 'primary' : 'default'"
      @click="item.run()"
    >
      <span :class="item.className">{{ item.label }}</span>
    </el-button>

    <span class="mx-1 h-4 w-px bg-gray-300" aria-hidden="true" />

    <el-button size="small" :disabled="disabled" :loading="imageUploading" @click="emit('upload-image')">
      图片
    </el-button>
    <el-button size="small" :disabled="disabled" @click="emit('image-url')">外链</el-button>
    <el-button size="small" :disabled="disabled" @click="emit('image-pick')">AI配图</el-button>

    <template v-if="editor.isActive('imageResize')">
      <span class="mx-1 h-4 w-px bg-gray-300" aria-hidden="true" />
      <el-button size="small" type="warning" plain :disabled="disabled" @click="emit('image-alt')">
        改Alt
      </el-button>
    </template>

    <span class="mx-1 h-4 w-px bg-gray-300" aria-hidden="true" />

    <el-button
      size="small"
      :disabled="disabled || !editor.can().insertTable()"
      @click="insertTable()"
    >
      表格
    </el-button>
  </div>
</template>

<script setup lang="ts">
import type { Editor } from "@tiptap/vue-3";
import { computed } from "vue";

defineOptions({ name: "ArticleJobDraftTipTapToolbar" });

const props = defineProps<{
  editor?: Editor;
  disabled?: boolean;
  imageUploading?: boolean;
}>();

const emit = defineEmits<{
  "upload-image": [];
  "image-url": [];
  "image-pick": [];
  "image-alt": [];
}>();

function insertTable() {
  const editor = props.editor;
  if (!editor) return;
  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

const textItems = computed(() => {
  const editor = props.editor;
  if (!editor) return [];

  const chain = () => editor.chain().focus();

  return [
    { key: "h1", label: "H1", className: "", active: () => editor.isActive("heading", { level: 1 }), run: () => chain().toggleHeading({ level: 1 }).run() },
    { key: "h2", label: "H2", className: "", active: () => editor.isActive("heading", { level: 2 }), run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: "h3", label: "H3", className: "", active: () => editor.isActive("heading", { level: 3 }), run: () => chain().toggleHeading({ level: 3 }).run() },
    { key: "bold", label: "B", className: "font-bold", active: () => editor.isActive("bold"), run: () => chain().toggleBold().run() },
    { key: "italic", label: "I", className: "italic", active: () => editor.isActive("italic"), run: () => chain().toggleItalic().run() },
    { key: "ul", label: "列表", className: "", active: () => editor.isActive("bulletList"), run: () => chain().toggleBulletList().run() },
    { key: "ol", label: "编号", className: "", active: () => editor.isActive("orderedList"), run: () => chain().toggleOrderedList().run() },
    { key: "quote", label: "引用", className: "", active: () => editor.isActive("blockquote"), run: () => chain().toggleBlockquote().run() },
    {
      key: "link",
      label: "链接",
      className: "",
      active: () => editor.isActive("link"),
      run: () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("链接 URL（https://）", prev ?? "");
        if (url === null) return;
        if (!url.trim()) {
          chain().extendMarkRange("link").unsetLink().run();
          return;
        }
        chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
      }
    }
  ];
});
</script>

<style scoped>
.draft-tiptap-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
