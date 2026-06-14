<!--
  稿件 stale 状态提示条 + 快捷修复操作。

  边界：
  - 不负责：API 调用（由父组件处理）
 -->
<template>
  <el-alert
    v-if="staleness"
    class="mb-4"
    type="warning"
    :closable="false"
    show-icon
    title="稿件已手动编辑，部分结果已失效"
  >
    <template #default>
      <ul class="mt-1 list-inside list-disc text-sm">
        <li v-if="staleness.affected.localSeo">本地 SEO 分需重算</li>
        <li v-if="staleness.affected.semrush">Semrush 分需重检</li>
        <li v-if="staleness.affected.ymyl">YMYL 审查需重新确认</li>
        <li v-if="staleness.affected.export">导出 HTML 已失效，需重新生成</li>
        <li v-if="staleness.affected.internalLinks">内链锚点可能错位，建议重跑内链</li>
        <li v-if="staleness.affected.images">配图占位可能错位</li>
      </ul>
      <p class="mt-2 text-xs text-gray-500">编辑于 {{ formatTime(staleness.invalidatedAt) }}</p>

      <div class="mt-3 flex flex-wrap gap-2">
        <el-button
          v-if="staleness.affected.localSeo"
          size="small"
          type="primary"
          :loading="resolving === 'refresh_local'"
          :disabled="Boolean(resolving)"
          @click="emit('resolve', 'refresh_local')"
        >
          重算本地 SEO
        </el-button>
        <el-button
          v-if="staleness.affected.semrush"
          size="small"
          :loading="resolving === 'rerun_semrush'"
          :disabled="Boolean(resolving)"
          @click="emit('resolve', 'rerun_semrush')"
        >
          重跑 Semrush 终检
        </el-button>
        <el-button
          v-if="staleness.affected.export"
          size="small"
          type="success"
          :loading="resolving === 'regenerate_export'"
          :disabled="Boolean(resolving)"
          @click="emit('resolve', 'regenerate_export')"
        >
          重新生成导出
        </el-button>
        <el-button
          v-if="staleness.affected.ymyl"
          size="small"
          @click="emit('go-review')"
        >
          去内容审查
        </el-button>
      </div>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
import type { DraftResolveStaleAction, DraftStaleness } from "@/api/seo-factory/types";

defineOptions({ name: "ArticleJobDraftStalenessBanner" });

defineProps<{
  staleness?: DraftStaleness | null;
  resolving?: DraftResolveStaleAction | null;
}>();

const emit = defineEmits<{
  resolve: [action: DraftResolveStaleAction];
  "go-review": [];
}>();

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
</script>
