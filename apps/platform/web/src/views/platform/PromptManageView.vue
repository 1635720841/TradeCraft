<!--
  Prompt 版本管理页（M12）：运营向「功能槽位 + 版本库」双视图。

  边界：
  - 不负责：LLM 调用与版本绑码（后端 prompt-runtime-bindings.ts）
-->
<template>
  <div class="p-4 space-y-4">
    <!-- 运营指引 -->
    <el-card shadow="never" class="ops-guide-card">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="text-base font-medium">Prompt 运营指南</div>
          <ul class="mt-2 space-y-1 text-sm text-gray-600">
            <li>
              <strong>日常调文案：</strong>在「当前线上配置」找到对应功能 → 点「编辑 Prompt」→ 保存即生效（无需改代码）。
            </li>
            <li>
              <strong>换 Prompt 版本（A/B）：</strong>在下方卡片选版本 → 点「应用」→ 新任务立即使用新版本。
            </li>
            <li>
              <strong>新建版本：</strong>在底部「全部版本」点新建，保存后再回到上方绑定到对应功能。
            </li>
          </ul>
        </div>
        <div class="shrink-0 rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm">
          <div class="font-medium text-gray-700">文章生产链路</div>
          <div class="mt-2 flex flex-wrap items-center gap-1 text-gray-500">
            <el-tag size="small" effect="plain">SERP</el-tag>
            <span>→</span>
            <el-tag size="small" type="primary" effect="plain">Brief</el-tag>
            <span>→</span>
            <el-tag size="small" type="primary" effect="plain">初稿</el-tag>
            <span>→</span>
            <el-tag size="small" effect="plain">内链/配图</el-tag>
            <span>→</span>
            <el-tag size="small" type="warning" effect="plain">优化</el-tag>
            <span>→</span>
            <el-tag size="small" effect="plain">导出</el-tag>
          </div>
          <div class="mt-2 text-xs text-gray-400">蓝色标签 = 本页可编辑的 Prompt 环节</div>
        </div>
      </div>
    </el-card>

    <!-- 当前线上配置 -->
    <el-card v-loading="bindingsLoading" shadow="never">
      <PromptRuntimeBoard
        :slots="runtimeSlots"
        :templates="allTemplates"
        :template-map="templateMap"
        :applying-slot-id="applyingSlotId"
        @edit="openEditDialog"
        @apply="handleApplyBinding"
      />
    </el-card>

    <!-- 全部版本库 -->
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">全部 Prompt 版本</span>
          <div class="flex flex-wrap items-center gap-2">
            <el-radio-group v-model="usageFilter" size="small" @change="onFilterChange">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="active">线上使用中</el-radio-button>
              <el-radio-button value="legacy">历史归档</el-radio-button>
              <el-radio-button value="unused">未接入</el-radio-button>
            </el-radio-group>
            <el-button type="primary" @click="openCreateDialog">新建版本</el-button>
            <el-button link type="primary" @click="refreshAll">刷新</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="filteredPrompts" stripe style="width: 100%">
        <el-table-column label="对应功能" min-width="160">
          <template #default="{ row }">
            <div class="font-medium">{{ usageOf(row.version).label }}</div>
            <div v-if="usageOf(row.version).hint" class="mt-1 text-xs text-gray-500 line-clamp-2">
              {{ usageOf(row.version).hint }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="接入状态" width="120">
          <template #default="{ row }">
            <el-tag :type="usageTagType(usageOf(row.version).category)" size="small">
              {{ usageTagLabel(usageOf(row.version).category) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="version" label="版本 ID" min-width="180">
          <template #default="{ row }">
            <code class="text-sm">{{ row.version }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="显示名称" min-width="140" />
        <el-table-column prop="isActive" label="模板状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
              {{ row.isActive ? "启用" : "停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="160">
          <template #default="{ row }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEditDialog(row.version)">编辑</el-button>
            <el-button type="primary" link @click="handleClearCache(row.version)">清缓存</el-button>
            <el-tooltip
              v-if="!deleteCheck(row.version).allowed"
              :content="deleteCheck(row.version).reason"
              placement="top"
            >
              <el-button type="danger" link disabled>删除</el-button>
            </el-tooltip>
            <el-button
              v-else
              type="danger"
              link
              :loading="deletingVersion === row.version"
              @click="handleDelete(row.version, row.name)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="fetchPrompts"
          @size-change="onSizeChange"
        />
      </div>

      <el-empty v-if="!loading && filteredPrompts.length === 0" description="暂无匹配版本" />
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog
      v-model="editorVisible"
      :title="editorMode === 'create' ? '新建 Prompt 版本' : `编辑 · ${editorForm.version}`"
      width="960px"
      destroy-on-close
      top="4vh"
      class="prompt-editor-dialog"
    >
      <div class="flex flex-col gap-4 lg:flex-row">
        <div v-if="editorSlot" class="lg:w-72 shrink-0 rounded-lg bg-gray-50 p-4 text-sm">
          <div class="font-medium text-gray-800">功能说明</div>
          <el-tag class="mt-2" type="success" size="small">线上使用中</el-tag>
          <dl class="mt-3 space-y-2 text-gray-600">
            <div>
              <dt class="text-xs text-gray-400">功能</dt>
              <dd>{{ editorSlot.label }}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-400">触发时机</dt>
              <dd>{{ editorSlot.trigger }}</dd>
            </div>
            <div>
              <dt class="text-xs text-gray-400">任务里怎么看</dt>
              <dd>{{ editorSlot.uiLocation }}</dd>
            </div>
          </dl>
          <div class="mt-3 text-xs text-gray-400">可用占位符</div>
          <div class="mt-1 flex flex-wrap gap-1">
            <el-tag
              v-for="ph in editorSlot.placeholders"
              :key="ph"
              size="small"
              type="info"
              effect="plain"
            >
              {{ ph }}
            </el-tag>
          </div>
        </div>

        <div v-else-if="editorMode === 'edit'" class="lg:w-72 shrink-0 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <div class="font-medium">此版本当前未绑定到任何功能</div>
          <p class="mt-2 text-xs leading-relaxed opacity-90">
            可在上方「当前线上配置」中选择此版本并点「应用」，即可让对应功能使用它。
          </p>
        </div>

        <el-form
          ref="editorFormRef"
          class="min-w-0 flex-1"
          :model="editorForm"
          :rules="editorRules"
          label-width="88px"
        >
          <el-form-item v-if="editorMode === 'create'" label="版本 ID" prop="version">
            <el-input v-model="editorForm.version" placeholder="seo_brief_v2" />
            <div class="mt-1 text-xs text-gray-400">须 seo_ 开头，如 seo_brief_v2、seo_draft_v2</div>
          </el-form-item>
          <el-form-item label="显示名称" prop="name">
            <el-input v-model="editorForm.name" placeholder="SEO Brief v2" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              v-model="editorForm.description"
              type="textarea"
              :rows="2"
              placeholder="给运营同事看的备注，如「2026-03 提升实体词覆盖率」"
            />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="editorForm.isActive" />
            <span class="ml-2 text-xs text-gray-500">停用后回退到 prompts 目录下的同名文件</span>
          </el-form-item>
          <el-form-item label="Prompt 正文" prop="content">
            <el-input
              v-model="editorForm.content"
              type="textarea"
              :rows="editorMode === 'create' ? 16 : 20"
              placeholder="Markdown 模板正文"
            />
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <div class="flex w-full items-center justify-between">
          <div>
            <el-button
              v-if="editorMode === 'edit' && deleteCheck(editorForm.version).allowed"
              type="danger"
              plain
              :loading="deletingVersion === editorForm.version"
              @click="handleDelete(editorForm.version, editorForm.name)"
            >
              删除此版本
            </el-button>
            <span
              v-else-if="editorMode === 'edit' && !deleteCheck(editorForm.version).allowed"
              class="text-xs text-gray-400"
            >
              {{ deleteCheck(editorForm.version).reason }}
            </span>
          </div>
          <div class="flex gap-2">
            <el-button @click="editorVisible = false">取消</el-button>
            <el-button type="primary" :loading="editorSubmitting" @click="submitEditor">
              保存并刷新缓存
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
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
  usageTagLabel,
  usageTagType,
  type PromptUsageCategory
} from "@/constants/prompt-usage";
import { message } from "@/utils/message";
import PromptRuntimeBoard from "./components/PromptRuntimeBoard.vue";

defineOptions({ name: "PromptManageView" });

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
const editorFormRef = ref<FormInstance>();
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
    {
      pattern: /^seo_[a-z0-9_]+$/,
      message: "须为 seo_ 前缀小写标识",
      trigger: "blur"
    }
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

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
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
    const msg = error instanceof Error ? error.message : "切换失败";
    message(msg, { type: "error" });
  } finally {
    applyingSlotId.value = null;
  }
}

function onSizeChange() {
  page.value = 1;
  void fetchPrompts();
}

function onFilterChange() {
  /* client-side filter only */
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
  const form = editorFormRef.value;
  if (!form) return;
  await form.validate(async valid => {
    if (!valid) return;
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
  });
}

async function handleDelete(version: string, name: string) {
  const check = deleteCheck(version);
  if (!check.allowed) {
    message(check.reason ?? "无法删除", { type: "warning" });
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确定删除 Prompt「${name}」（${version}）？\n\n删除后不可恢复；若 prompts 目录仍有同名 .md 文件，运行时可能回退读取文件。`,
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
    const msg = error instanceof Error ? error.message : "删除失败";
    message(msg, { type: "error" });
  } finally {
    deletingVersion.value = null;
  }
}

async function handleClearCache(version: string) {
  try {
    await clearPromptTemplateCache(version);
    message(`已清除 ${version} 的缓存`, { type: "success" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "清缓存失败";
    message(msg, { type: "error" });
  }
}

onMounted(() => {
  void refreshAll();
});
</script>

<style scoped>
.ops-guide-card :deep(.el-card__body) {
  padding: 20px;
}
</style>
