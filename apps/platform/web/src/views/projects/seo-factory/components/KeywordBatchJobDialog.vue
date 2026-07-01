<!--
  关键词池：批量创建文章任务对话框。
-->
<template>
  <el-dialog
    :model-value="visible"
    title="批量创建文章任务"
    width="520px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="说明"
      description="将为所选关键词各创建一个生成任务；已归档关键词会被跳过。入队前会校验本月文章配额。"
    />
    <el-form label-width="100px">
      <el-form-item label="已选关键词">
        <span>{{ selectedCount }} 个</span>
      </el-form-item>
      <el-form-item label="目标站点">
        <el-select
          :model-value="siteId"
          class="w-full"
          placeholder="默认各关键词绑定站点或首个站点"
          clearable
          :loading="sitesLoading"
          @update:model-value="emit('update:siteId', $event)"
        >
          <el-option v-for="site in sites" :key="site.id" :label="site.domain" :value="site.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="配额">
        <span>{{ quotaPreviewText }}</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="creating" :disabled="!quotaCanConsume" @click="emit('submit')">
        确认创建
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { SiteItem } from "@/api/seo-factory/types";

defineOptions({ name: "KeywordBatchJobDialog" });

defineProps<{
  visible: boolean;
  selectedCount: number;
  siteId: string;
  sites: SiteItem[];
  sitesLoading: boolean;
  quotaPreviewText: string;
  quotaCanConsume: boolean;
  creating: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  "update:siteId": [value: string];
  submit: [];
}>();
</script>
