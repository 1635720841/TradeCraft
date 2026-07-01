<!--
  Console 访问控制：平台运营权限授予。
-->
<template>
  <div v-loading="loading">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <span class="font-medium">{{ userEmail }}</span>
      <div class="flex flex-wrap gap-2">
        <el-button @click="emit('select-all')">全选平台权限</el-button>
        <el-button @click="emit('clear-grants')">清空额外授权</el-button>
        <el-button type="primary" :loading="saving" @click="emit('save')">保存权限</el-button>
      </div>
    </div>

    <el-alert
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      :title="`角色默认权限：${defaultPermHint}（灰色不可取消）`"
    />

    <el-alert v-if="effectivePermissions.length" class="mb-4" type="success" :closable="false" show-icon>
      <template #title>最终生效权限（{{ effectivePermissions.length }} 项）</template>
      <div class="mt-1 flex flex-wrap gap-1">
        <el-tag v-for="permId in effectivePermissions" :key="permId" size="small" type="info">
          {{ permissionNameMap[permId] ?? permId }}
        </el-tag>
      </div>
    </el-alert>

    <div
      v-for="section in sections"
      :key="section.key"
      class="mb-4 rounded-lg border mw-border-card p-3"
    >
      <div class="mb-2 text-sm font-medium mw-text-body">{{ section.label }}</div>
      <el-checkbox-group :model-value="selectedGrantIds" @change="onGrantChange">
        <div class="grid grid-cols-1 gap-2">
          <el-checkbox
            v-for="perm in section.items"
            :key="perm.id"
            :value="perm.id"
            :disabled="isDefaultPermission(perm.id)"
          >
            <span>{{ perm.name }}</span>
            <span v-if="perm.description" class="ml-1 text-xs mw-text-muted">— {{ perm.description }}</span>
          </el-checkbox>
        </div>
      </el-checkbox-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CheckboxValueType } from "element-plus";
import type { PermissionDefinition } from "@/api/console/index";

defineOptions({ name: "ConsolePermissionGrantPanel" });

defineProps<{
  loading: boolean;
  saving: boolean;
  userEmail: string;
  defaultPermHint: string;
  effectivePermissions: string[];
  permissionNameMap: Record<string, string>;
  sections: Array<{ key: string; label: string; items: PermissionDefinition[] }>;
  selectedGrantIds: string[];
  isDefaultPermission: (permId: string) => boolean;
}>();

const emit = defineEmits<{
  "select-all": [];
  "clear-grants": [];
  save: [];
  "grant-change": [ids: string[]];
}>();

function onGrantChange(value: CheckboxValueType | CheckboxValueType[]) {
  const list = Array.isArray(value) ? value : [value];
  emit(
    "grant-change",
    list.map((item) => String(item))
  );
}
</script>
