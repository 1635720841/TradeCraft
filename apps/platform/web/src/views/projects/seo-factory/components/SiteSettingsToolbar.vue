<!--
  项目配置页站点选择与保存工具栏。
-->
<template>
  <div class="flex flex-wrap gap-2 justify-end">
    <el-select
      :model-value="siteId"
      placeholder="选择站点"
      style="width: 220px"
      :loading="sitesLoading"
      @update:model-value="onSiteIdChange"
    >
      <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id" />
    </el-select>
    <el-button
      v-if="canManage"
      type="primary"
      :loading="saving"
      :disabled="!siteId"
      @click="emit('save')"
    >
      保存配置
    </el-button>
  </div>
</template>

<script setup lang="ts">
import type { SiteItem } from "@/api/seo-factory/types";

defineProps<{
  siteId: string;
  sites: SiteItem[];
  sitesLoading: boolean;
  canManage: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  "update:siteId": [value: string];
  siteChange: [];
  save: [];
}>();

function onSiteIdChange(value: string) {
  emit("update:siteId", value);
  emit("siteChange");
}
</script>
