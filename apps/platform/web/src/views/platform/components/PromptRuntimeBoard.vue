<!--
  当前线上 Prompt 配置看板：按业务功能展示并切换生效版本。

  边界：
  - 不负责：版本 CRUD（父页面 PromptManageView）
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-base font-medium text-gray-900">当前线上配置</h3>
        <p class="mt-1 text-sm text-gray-500">
          为每个功能选择 Prompt 版本并点「应用」——新任务立即生效，无需改代码。
        </p>
      </div>
      <el-tag type="success" effect="plain">5 个功能位</el-tag>
    </div>

    <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <el-card
        v-for="slot in slots"
        :key="slot.id"
        shadow="hover"
        class="prompt-slot-card"
        :body-style="{ padding: '16px' }"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">{{ slot.label }}</span>
              <el-tag size="small" type="primary" effect="plain">{{ slot.workflowStep }}</el-tag>
            </div>
            <p class="mt-2 text-sm text-gray-600">{{ slot.trigger }}</p>
          </div>
          <el-button type="primary" link size="small" @click="emit('edit', slot.activeVersion)">
            编辑正文
          </el-button>
        </div>

        <div class="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-3">
          <div class="text-xs font-medium text-gray-600">切换使用版本</div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <el-select
              :model-value="draftVersions[slot.id] ?? slot.activeVersion"
              class="min-w-[220px] flex-1"
              filterable
              placeholder="选择 Prompt 版本"
              @update:model-value="value => setDraftVersion(slot.id, String(value))"
            >
              <el-option
                v-for="opt in optionsForSlot(slot)"
                :key="opt.version"
                :label="`${opt.name} (${opt.version})`"
                :value="opt.version"
              />
            </el-select>
            <el-button
              type="primary"
              size="small"
              :disabled="!canApply(slot)"
              :loading="applyingSlotId === slot.id"
              @click="applyBinding(slot)"
            >
              应用
            </el-button>
          </div>
          <div v-if="canApply(slot)" class="mt-2 text-xs text-amber-700">
            将从 <code>{{ slot.activeVersion }}</code> 切换为
            <code>{{ draftVersions[slot.id] }}</code>
          </div>
          <div v-else class="mt-2 text-xs text-gray-500">
            当前线上：<code class="text-primary">{{ slot.activeVersion }}</code>
            <span v-if="templateMap[slot.activeVersion]?.name">
              · {{ templateMap[slot.activeVersion]?.name }}
            </span>
          </div>
        </div>

        <div class="mt-3 text-xs text-gray-500">
          <span class="text-gray-400">任务里查看：</span>{{ slot.uiLocation }}
        </div>

        <div class="mt-2 flex flex-wrap gap-1">
          <el-tag
            v-for="ph in slot.placeholders.slice(0, 3)"
            :key="ph"
            size="small"
            type="info"
            effect="plain"
          >
            {{ ph }}
          </el-tag>
          <el-tag v-if="slot.placeholders.length > 3" size="small" type="info" effect="plain">
            +{{ slot.placeholders.length - 3 }}
          </el-tag>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import { ElMessageBox } from "element-plus";
import type { PromptRuntimeSlot, PromptRuntimeSlotId, PromptTemplateItem } from "@/api/platform/prompt";
import { versionsForSlot } from "@/constants/prompt-usage";

defineOptions({ name: "PromptRuntimeBoard" });

const props = defineProps<{
  slots: PromptRuntimeSlot[];
  templates: PromptTemplateItem[];
  templateMap: Record<string, PromptTemplateItem | undefined>;
  applyingSlotId: PromptRuntimeSlotId | null;
}>();

const emit = defineEmits<{
  edit: [version: string];
  apply: [slotId: PromptRuntimeSlotId, activeVersion: string];
}>();

const draftVersions = reactive<Partial<Record<PromptRuntimeSlotId, string>>>({});

watch(
  () => props.slots,
  slots => {
    for (const slot of slots) {
      if (!draftVersions[slot.id] || draftVersions[slot.id] === slot.activeVersion) {
        draftVersions[slot.id] = slot.activeVersion;
      }
    }
  },
  { immediate: true, deep: true }
);

function optionsForSlot(slot: PromptRuntimeSlot) {
  return versionsForSlot(slot, props.templates);
}

function setDraftVersion(slotId: PromptRuntimeSlotId, version: string) {
  draftVersions[slotId] = version;
}

function canApply(slot: PromptRuntimeSlot) {
  const draft = draftVersions[slot.id];
  return Boolean(draft && draft !== slot.activeVersion);
}

async function applyBinding(slot: PromptRuntimeSlot) {
  const nextVersion = draftVersions[slot.id];
  if (!nextVersion || nextVersion === slot.activeVersion) return;

  try {
    await ElMessageBox.confirm(
      `将「${slot.label}」的线上版本从 ${slot.activeVersion} 切换为 ${nextVersion}？\n\n切换后新创建/续跑的任务将使用新版本。`,
      "确认切换版本",
      { type: "warning", confirmButtonText: "确认应用", cancelButtonText: "取消" }
    );
    emit("apply", slot.id, nextVersion);
  } catch {
    /* cancelled */
  }
}
</script>

<style scoped>
.prompt-slot-card {
  border-color: var(--el-border-color-lighter);
}
</style>
