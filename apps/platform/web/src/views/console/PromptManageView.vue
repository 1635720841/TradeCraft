<!--
  Prompt 版本管理页（M12）：运营向「功能槽位 + 版本库」双视图。
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <PromptOpsGuideCard />
    </el-card>

    <el-card v-loading="bindingsLoading" shadow="never">
      <PromptRuntimeBoard
        :slots="runtimeSlots"
        :templates="allTemplates"
        :template-map="templateMap"
        :applying-slot-id="applyingSlotId"
        :readonly="!canManagePrompt"
        @edit="openEditDialog"
        @apply="handleApplyBinding"
      />
    </el-card>

    <PromptVersionTable
      :loading="loading"
      :prompts="filteredPrompts"
      :page="page"
      :limit="limit"
      :total="total"
      v-model:usage-filter="usageFilter"
      :can-manage="canManagePrompt"
      :deleting-version="deletingVersion"
      :usage-of="usageOf"
      :delete-check="deleteCheck"
      @create="openCreateDialog"
      @refresh="refreshAll"
      @edit="openEditDialog"
      @clear-cache="handleClearCache"
      @delete="handleDelete"
      @page-change="(p) => { page = p; fetchPrompts(); }"
      @size-change="onSizeChange"
    />

    <PromptEditorDialog
      v-model:visible="editorVisible"
      :mode="editorMode"
      :form="editorForm"
      :rules="editorRules"
      :slot-info="editorSlot"
      :submitting="editorSubmitting"
      :deleting="deletingVersion === editorForm.version"
      :delete-allowed="deleteCheck(editorForm.version).allowed"
      :delete-reason="deleteCheck(editorForm.version).reason"
      @submit="submitEditor"
      @delete="handleDelete(editorForm.version, editorForm.name)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { usePromptManage } from "@/composables/usePromptManage";
import { hasPerms } from "@/utils/auth";
import PromptRuntimeBoard from "@/views/platform/components/PromptRuntimeBoard.vue";
import PromptEditorDialog from "./components/prompt/PromptEditorDialog.vue";
import PromptOpsGuideCard from "./components/prompt/PromptOpsGuideCard.vue";
import PromptVersionTable from "./components/prompt/PromptVersionTable.vue";

defineOptions({ name: "PromptManageView" });

const canManagePrompt = computed(() => hasPerms("console:prompt:manage"));

const {
  loading,
  bindingsLoading,
  applyingSlotId,
  deletingVersion,
  allTemplates,
  runtimeSlots,
  page,
  limit,
  total,
  usageFilter,
  editorVisible,
  editorMode,
  editorSubmitting,
  editorForm,
  editorRules,
  templateMap,
  editorSlot,
  filteredPrompts,
  usageOf,
  deleteCheck,
  refreshAll,
  handleApplyBinding,
  onSizeChange,
  openCreateDialog,
  openEditDialog,
  submitEditor,
  handleDelete,
  handleClearCache,
  fetchPrompts
} = usePromptManage();

onMounted(() => {
  void refreshAll();
});
</script>
