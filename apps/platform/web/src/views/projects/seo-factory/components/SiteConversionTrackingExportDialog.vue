<!--
  转化追踪表导出：说明 + 下载。

  边界：
  - 不负责：站点 UTM 配置（SiteDetailView 写作素材）
-->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="`导出转化追踪表 · ${siteDomain}`"
    width="600px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <SiteConversionTrackingHelpPanel />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="exporting" @click="handleExport">下载 CSV</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { exportSiteAttributionCsv } from "@/api/seo-factory/site";
import { message } from "@/utils/message";
import SiteConversionTrackingHelpPanel from "./SiteConversionTrackingHelpPanel.vue";

defineOptions({ name: "SiteConversionTrackingExportDialog" });

const props = defineProps<{
  modelValue: boolean;
  projectId: string;
  siteId: string;
  siteDomain: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const exporting = ref(false);

async function handleExport() {
  exporting.value = true;
  try {
    const blob = await exportSiteAttributionCsv(props.projectId, props.siteId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attribution-${props.siteDomain.replace(/[^\w.-]+/g, "_")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    message("转化追踪表已下载", { type: "success" });
    emit("update:modelValue", false);
  } catch (error) {
    message(error instanceof Error ? error.message : "导出失败", { type: "error" });
  } finally {
    exporting.value = false;
  }
}
</script>
