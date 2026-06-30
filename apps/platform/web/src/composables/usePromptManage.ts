/**
 * Prompt 运营管理 composable。
 */

import { computed, reactive, ref } from "vue";
import type { FormRules } from "element-plus";
import { ElMessageBox } from "element-plus";
import {
  clearPromptTemplateCache,
  createPromptTemplate,
  deletePromptTemplate,
  getPromptRuntimeBindings,
  getPromptTemplate,
  listPromptTemplates,
  updatePromptRuntimeBinding,
  updatePromptTemplate,
  type PromptRuntimeSlot,
  type PromptRuntimeSlotId,
  type PromptTemplateItem
} from "@/api/platform/prompt";
import {
  canDeletePromptVersion,
  resolvePromptUsage,
  type PromptUsageCategory
} from "@/constants/prompt-usage";
import { message } from "@/utils/message";

export function usePromptManage() {
  const loading = ref(false);
  const bindingsLoading = ref(false);
  const applyingSlotId = ref<PromptRuntimeSlotId | null>(null);
  const deletingVersion = ref<string | null>(null);
  const prompts = ref<PromptTemplateItem[]>([]);
  const allTemplates = ref<PromptTemplateItem[]>([]);
  const runtimeSlots = ref<PromptRuntimeSlot[]>([]);
  const page = ref(1);
  const limit = ref(50);
  const total = ref(0);
  const usageFilter = ref<"all" | PromptUsageCategory>("all");

  const editorVisible = ref(false);
  const editorMode = ref<"create" | "edit">("edit");
  const editorSubmitting = ref(false);
  const editorForm = reactive({
    version: "",
    name: "",
    description: "",
    content: "",
    isActive: true
  });

  const editorRules: FormRules = {
    version: [
      { required: true, message: "请输入版本 ID", trigger: "blur" },
      { pattern: /^seo_[a-z0-9_]+$/, message: "须为 seo_ 前缀小写标识", trigger: "blur" }
    ],
    name: [{ required: true, message: "请输入显示名称", trigger: "blur" }],
    content: [
      { required: true, message: "请输入 Prompt 正文", trigger: "blur" },
      { min: 20, message: "正文过短", trigger: "blur" }
    ]
  };

  const templateMap = computed(() => {
    const map: Record<string, PromptTemplateItem> = {};
    for (const row of prompts.value) {
      map[row.version] = row;
    }
    return map;
  });

  const editorSlot = computed(() =>
    runtimeSlots.value.find((slot) => slot.activeVersion === editorForm.version)
  );

  const filteredPrompts = computed(() => {
    if (usageFilter.value === "all") return prompts.value;
    return prompts.value.filter((row) => usageOf(row.version).category === usageFilter.value);
  });

  function usageOf(version: string) {
    return resolvePromptUsage(version, runtimeSlots.value);
  }

  function deleteCheck(version: string) {
    return canDeletePromptVersion(version, runtimeSlots.value);
  }

  async function fetchAllTemplates() {
    const result = await listPromptTemplates(1, 100);
    allTemplates.value = result.items;
  }

  async function fetchBindings() {
    bindingsLoading.value = true;
    try {
      runtimeSlots.value = await getPromptRuntimeBindings();
    } finally {
      bindingsLoading.value = false;
    }
  }

  async function fetchPrompts() {
    loading.value = true;
    try {
      const result = await listPromptTemplates(page.value, limit.value);
      prompts.value = result.items;
      total.value = result.pagination.total;
      page.value = result.pagination.page;
      limit.value = result.pagination.limit;
    } finally {
      loading.value = false;
    }
  }

  async function refreshAll() {
    await Promise.all([fetchBindings(), fetchPrompts(), fetchAllTemplates()]);
  }

  async function handleApplyBinding(slotId: PromptRuntimeSlotId, activeVersion: string) {
    applyingSlotId.value = slotId;
    try {
      await updatePromptRuntimeBinding(slotId, activeVersion);
      message("版本已切换，新任务将使用此 Prompt", { type: "success" });
      await refreshAll();
    } catch (error) {
      message(error instanceof Error ? error.message : "切换失败", { type: "error" });
    } finally {
      applyingSlotId.value = null;
    }
  }

  function onSizeChange() {
    page.value = 1;
    void fetchPrompts();
  }

  function resetEditorForm() {
    editorForm.version = "";
    editorForm.name = "";
    editorForm.description = "";
    editorForm.content = "";
    editorForm.isActive = true;
  }

  function openCreateDialog() {
    editorMode.value = "create";
    resetEditorForm();
    editorVisible.value = true;
  }

  async function openEditDialog(version: string) {
    editorMode.value = "edit";
    resetEditorForm();
    editorVisible.value = true;
    editorSubmitting.value = true;
    try {
      const row = await getPromptTemplate(version);
      editorForm.version = row.version;
      editorForm.name = row.name;
      editorForm.description = row.description ?? "";
      editorForm.content = row.content ?? "";
      editorForm.isActive = row.isActive;
    } finally {
      editorSubmitting.value = false;
    }
  }

  async function submitEditor() {
    editorSubmitting.value = true;
    try {
        if (editorMode.value === "create") {
          await createPromptTemplate({
            version: editorForm.version.trim(),
            name: editorForm.name.trim(),
            description: editorForm.description.trim() || undefined,
            content: editorForm.content,
            isActive: editorForm.isActive
          });
          message("新版本已创建，请在上方「当前线上配置」中绑定到对应功能", { type: "success" });
        } else {
          await updatePromptTemplate(editorForm.version, {
            name: editorForm.name.trim(),
            description: editorForm.description.trim() || undefined,
            content: editorForm.content,
            isActive: editorForm.isActive
          });
          message("已保存，线上任务将使用新正文", { type: "success" });
        }
        editorVisible.value = false;
        await refreshAll();
      } finally {
        editorSubmitting.value = false;
      }
  }

  async function handleDelete(version: string, name: string) {
    const check = deleteCheck(version);
    if (!check.allowed) {
      message(check.reason ?? "无法删除", { type: "warning" });
      return;
    }
    try {
      await ElMessageBox.confirm(
        `确定删除 Prompt「${name}」（${version}）？\n\n删除后不可恢复。`,
        "确认删除",
        { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
      );
    } catch {
      return;
    }
    deletingVersion.value = version;
    try {
      await deletePromptTemplate(version);
      message("已删除", { type: "success" });
      if (editorVisible.value && editorForm.version === version) {
        editorVisible.value = false;
      }
      await refreshAll();
    } catch (error) {
      message(error instanceof Error ? error.message : "删除失败", { type: "error" });
    } finally {
      deletingVersion.value = null;
    }
  }

  async function handleClearCache(version: string) {
    try {
      await clearPromptTemplateCache(version);
      message(`已清除 ${version} 的缓存`, { type: "success" });
    } catch (error) {
      message(error instanceof Error ? error.message : "清缓存失败", { type: "error" });
    }
  }

  return {
    loading,
    bindingsLoading,
    applyingSlotId,
    deletingVersion,
    prompts,
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
    handleClearCache
  };
}
