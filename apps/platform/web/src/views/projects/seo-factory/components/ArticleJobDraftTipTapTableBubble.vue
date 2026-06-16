<!--
  表格悬浮操作栏：光标进入表格时在表格上方显示（类似 Word）。
 -->
<template>
  <Teleport to="body">
    <div
      v-show="visible"
      ref="panelRef"
      class="draft-table-bubble"
      :style="panelStyle"
      role="toolbar"
      aria-label="表格操作"
      @mousedown.prevent
    >
      <span class="draft-table-bubble__title">表格</span>

      <div class="draft-table-bubble__group">
        <span class="draft-table-bubble__label">行</span>
        <button
          type="button"
          class="draft-table-bubble__btn"
          :disabled="disabled || !editor.can().addRowAfter()"
          title="在下方插入行"
          @mousedown.prevent
          @click="runTable('addRowAfter')"
        >
          插入行
        </button>
        <button
          type="button"
          class="draft-table-bubble__btn draft-table-bubble__btn--danger"
          :disabled="disabled || !editor.can().deleteRow()"
          title="删除当前行"
          @mousedown.prevent
          @click="runTable('deleteRow')"
        >
          删行
        </button>
      </div>

      <span class="draft-table-bubble__divider" aria-hidden="true" />

      <div class="draft-table-bubble__group">
        <span class="draft-table-bubble__label">列</span>
        <button
          type="button"
          class="draft-table-bubble__btn"
          :disabled="disabled || !editor.can().addColumnAfter()"
          title="在右侧插入列"
          @mousedown.prevent
          @click="runTable('addColumnAfter')"
        >
          插入列
        </button>
        <button
          type="button"
          class="draft-table-bubble__btn draft-table-bubble__btn--danger"
          :disabled="disabled || !editor.can().deleteColumn()"
          title="删除当前列"
          @mousedown.prevent
          @click="runTable('deleteColumn')"
        >
          删列
        </button>
      </div>

      <span class="draft-table-bubble__divider" aria-hidden="true" />

      <button
        type="button"
        class="draft-table-bubble__btn draft-table-bubble__btn--danger"
        :disabled="disabled || !editor.can().deleteTable()"
        title="删除整个表格"
        @mousedown.prevent
        @click="runTable('deleteTable')"
      >
        删表
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { Editor } from "@tiptap/vue-3";
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

defineOptions({ name: "ArticleJobDraftTipTapTableBubble" });

const props = defineProps<{
  editor: Editor;
  disabled?: boolean;
}>();

type TableCommand = "addRowAfter" | "deleteRow" | "addColumnAfter" | "deleteColumn" | "deleteTable";

const visible = ref(false);
const panelRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({
  position: "fixed",
  top: "-9999px",
  left: "-9999px",
  zIndex: "5000"
});

let hideOnBlurTimer: ReturnType<typeof setTimeout> | null = null;

function isSelectionInTable(editor: Editor): boolean {
  if (editor.isActive("table") || editor.isActive("tableCell") || editor.isActive("tableHeader")) {
    return true;
  }

  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "table" || name === "tableCell" || name === "tableHeader") return true;
  }
  return false;
}

function findActiveTableElement(editor: Editor): HTMLTableElement | null {
  const { view, state } = editor;
  const domAtPos = view.domAtPos(state.selection.from);
  let node: globalThis.Node | null = domAtPos.node;

  if (node.nodeType === globalThis.Node.TEXT_NODE) {
    node = node.parentNode;
  }

  if (!(node instanceof HTMLElement)) return null;
  return node.closest("table");
}

function updatePanelPosition(tableEl: HTMLTableElement) {
  const rect = tableEl.getBoundingClientRect();
  const panelHeight = panelRef.value?.offsetHeight ?? 48;
  const gap = 10;
  const spaceAbove = rect.top;
  const showBelow = spaceAbove < panelHeight + gap + 8;

  const top = showBelow ? rect.bottom + gap : rect.top - panelHeight - gap;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 8);

  panelStyle.value = {
    position: "fixed",
    top: `${Math.max(8, top)}px`,
    left: `${left}px`,
    zIndex: "5000"
  };
}

async function syncTableBubble() {
  if (props.disabled || !props.editor.isEditable) {
    visible.value = false;
    return;
  }

  if (!isSelectionInTable(props.editor)) {
    visible.value = false;
    return;
  }

  const tableEl = findActiveTableElement(props.editor);
  if (!tableEl) {
    visible.value = false;
    return;
  }

  visible.value = true;
  await nextTick();
  updatePanelPosition(tableEl);
}

function scheduleHide() {
  if (hideOnBlurTimer) clearTimeout(hideOnBlurTimer);
  hideOnBlurTimer = setTimeout(() => {
    if (!props.editor.isFocused) visible.value = false;
  }, 120);
}

function cancelHide() {
  if (hideOnBlurTimer) {
    clearTimeout(hideOnBlurTimer);
    hideOnBlurTimer = null;
  }
}

function runTable(command: TableCommand) {
  props.editor.chain().focus()[command]().run();
  void syncTableBubble();
}

function onEditorFocus() {
  cancelHide();
  void syncTableBubble();
}

function bindEditorEvents() {
  const { editor } = props;
  editor.on("selectionUpdate", syncTableBubble);
  editor.on("transaction", syncTableBubble);
  editor.on("focus", onEditorFocus);
  editor.on("blur", scheduleHide);
}

function unbindEditorEvents() {
  const { editor } = props;
  editor.off("selectionUpdate", syncTableBubble);
  editor.off("transaction", syncTableBubble);
  editor.off("focus", onEditorFocus);
  editor.off("blur", scheduleHide);
}

onMounted(() => {
  bindEditorEvents();
  window.addEventListener("scroll", syncTableBubble, true);
  window.addEventListener("resize", syncTableBubble);
  void syncTableBubble();
});

onBeforeUnmount(() => {
  unbindEditorEvents();
  window.removeEventListener("scroll", syncTableBubble, true);
  window.removeEventListener("resize", syncTableBubble);
  if (hideOnBlurTimer) clearTimeout(hideOnBlurTimer);
});
</script>

<style scoped lang="scss">
.draft-table-bubble {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: min(96vw, 520px);
  padding: 8px 10px;
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  box-shadow:
    0 8px 24px rgb(15 23 42 / 14%),
    0 2px 6px rgb(15 23 42 / 8%);
  pointer-events: auto;
}

.draft-table-bubble__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
  padding: 0 6px 0 2px;
  white-space: nowrap;
}

.draft-table-bubble__group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.draft-table-bubble__label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 0 2px;
  white-space: nowrap;
}

.draft-table-bubble__divider {
  width: 1px;
  height: 22px;
  margin: 0 2px;
  background: var(--el-border-color);
}

.draft-table-bubble__btn {
  appearance: none;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1;
  padding: 6px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    color 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--el-color-primary-light-5);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.draft-table-bubble__btn--danger:hover:not(:disabled) {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
</style>
