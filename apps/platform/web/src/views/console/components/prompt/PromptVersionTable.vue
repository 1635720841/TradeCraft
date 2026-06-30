<!--
  Prompt 版本库表格。
-->
<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">全部 Prompt 版本</span>
        <div class="flex flex-wrap items-center gap-2">
          <el-radio-group :model-value="usageFilter" size="small" @update:model-value="emit('update:usageFilter', $event)">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="active">线上使用中</el-radio-button>
            <el-radio-button value="legacy">历史归档</el-radio-button>
            <el-radio-button value="unused">未接入</el-radio-button>
          </el-radio-group>
          <el-button v-if="canManage" type="primary" @click="emit('create')">新建版本</el-button>
          <el-button link type="primary" @click="emit('refresh')">刷新</el-button>
        </div>
      </div>
    </template>

    <el-table v-loading="loading" :data="prompts" stripe style="width: 100%">
      <el-table-column label="对应功能" min-width="160">
        <template #default="{ row }">
          <div class="font-medium">{{ usageOf(row.version).label }}</div>
          <div v-if="usageOf(row.version).hint" class="mt-1 text-xs mw-text-muted line-clamp-2">
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
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column v-if="canManage" label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="emit('edit', row.version)">编辑</el-button>
          <el-button type="primary" link @click="emit('clear-cache', row.version)">清缓存</el-button>
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
            @click="emit('delete', row.version, row.name)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="mt-4 flex justify-end">
      <el-pagination
        :current-page="page"
        :page-size="limit"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="emit('page-change', $event)"
        @size-change="emit('size-change')"
      />
    </div>

    <el-empty v-if="!loading && prompts.length === 0" description="暂无匹配版本" />
  </el-card>
</template>

<script setup lang="ts">
import type { PromptTemplateItem } from "@/api/platform/prompt";
import type { PromptUsageCategory } from "@/constants/prompt-usage";
import { usageTagLabel, usageTagType } from "@/constants/prompt-usage";

defineOptions({ name: "PromptVersionTable" });

defineProps<{
  loading: boolean;
  prompts: PromptTemplateItem[];
  page: number;
  limit: number;
  total: number;
  usageFilter: "all" | PromptUsageCategory;
  canManage: boolean;
  deletingVersion: string | null;
  usageOf: (version: string) => ReturnType<typeof import("@/constants/prompt-usage").resolvePromptUsage>;
  deleteCheck: (version: string) => { allowed: boolean; reason?: string };
}>();

const emit = defineEmits<{
  "update:usageFilter": [value: "all" | PromptUsageCategory];
  create: [];
  refresh: [];
  edit: [version: string];
  "clear-cache": [version: string];
  delete: [version: string, name: string];
  "page-change": [page: number];
  "size-change": [];
}>();

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}
</script>
