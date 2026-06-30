<!--
  Console 访问控制：租户成员菜单覆盖。
-->
<template>
  <div v-loading="loading">
    <el-alert
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="常规场景请通过「企业管理 → 成员与权限」控制访问；勿随意覆盖菜单，否则可能与实际权限不一致。"
    />

    <div v-if="menuConfig" class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <span class="font-medium">{{ menuConfig.user.email }}</span>
      <el-button type="primary" :loading="saving" @click="emit('save')">保存覆盖</el-button>
    </div>

    <el-checkbox-group v-if="menuConfig" :model-value="enabledMenuIds" @change="emit('update:enabledMenuIds', $event)">
      <div class="space-y-2">
        <el-checkbox v-for="menu in menuConfig.menus" :key="menu.id" :value="menu.id">
          {{ menu.title }}
          <span class="text-xs mw-text-muted">（{{ menu.routePath }}）</span>
        </el-checkbox>
      </div>
    </el-checkbox-group>
  </div>
</template>

<script setup lang="ts">
import type { UserMenuConfig } from "@/api/console/index";

defineOptions({ name: "ConsoleMenuOverridePanel" });

defineProps<{
  loading: boolean;
  saving: boolean;
  menuConfig: UserMenuConfig | null;
  enabledMenuIds: string[];
}>();

const emit = defineEmits<{
  save: [];
  "update:enabledMenuIds": [ids: string[]];
}>();
</script>
