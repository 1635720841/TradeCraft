<!--
  文章任务列表工具栏：阶段筛选、站点、搜索、提示与批量操作。

  边界：
  - 不负责：表格行操作与数据拉取
-->
<template>
  <div v-if="part === 'header'" class="flex flex-wrap items-center justify-between gap-2">
      <span class="font-medium">文章任务</span>
      <div class="flex flex-wrap items-center gap-2">
        <el-select
          :model-value="listFilter"
          placeholder="阶段"
          style="width: 160px"
          @update:model-value="onListFilterChange"
        >
          <el-option label="全部任务" value="all" />
          <el-option label="待确认大纲" value="outlinePending" />
          <el-option label="敏感内容待审核" value="reviewPending" />
          <el-option label="生成中" value="generating" />
          <el-option label="生成失败" value="failed" />
          <el-option label="SEO 未达标" value="seoNotReady" />
          <el-option v-if="cmsUiEnabled" label="待发布" value="publishPending" />
          <el-option label="稿件待处理" value="staleDraft" />
          <el-option v-if="cmsUiEnabled" label="发布失败" value="publishFailed" />
        </el-select>
        <el-select
          :model-value="filterSiteId"
          clearable
          placeholder="按站点"
          style="width: 160px"
          :loading="sitesLoading"
          @update:model-value="onSiteFilterUpdate"
        >
          <el-option
            v-for="site in sites"
            :key="site.id"
            :label="site.domain"
            :value="site.id"
          />
        </el-select>
        <el-checkbox
          :model-value="siteOwnerMeFilter"
          @change="toggleSiteOwnerFilter"
        >
          我负责的站点
        </el-checkbox>
        <el-tag v-if="polling" type="info" size="small">自动刷新中</el-tag>
        <el-button @click="emit('refresh')">刷新</el-button>
        <el-button v-if="canCreateJob" type="primary" @click="emit('create')">
          新建任务
        </el-button>
      </div>
  </div>

  <template v-else>
  <div class="mb-4 flex flex-wrap items-center gap-3">
    <el-input
      :model-value="keywordSearch"
      clearable
      placeholder="搜索关键词"
      style="width: 220px"
      @update:model-value="onKeywordUpdate"
      @clear="emit('keyword-search-clear')"
    />
  </div>

  <div v-if="activeAlert" class="mb-4">
    <el-alert
      :type="activeAlert.type"
      :closable="false"
      show-icon
      :title="activeAlert.title"
    >
      <template v-if="activeAlert.description" #default>
        {{ activeAlert.description }}
        <el-button link type="primary" @click="emit('clear-list-filter')">查看全部任务</el-button>
      </template>
    </el-alert>
  </div>

  <div v-if="selectedCount" class="mb-4 flex flex-wrap items-center gap-2">
    <span class="text-sm text-gray-600">已选 {{ selectedCount }} 项</span>
    <el-button
      v-if="briefApprovableCount > 0"
      size="small"
      type="success"
      :loading="batchBriefApproving"
      @click="emit('batch-brief-approve')"
    >
      批量确认大纲（{{ briefApprovableCount }}）
    </el-button>
    <el-button
      size="small"
      type="warning"
      :loading="batchRetrying"
      :disabled="retryableCount === 0"
      @click="emit('batch-retry')"
    >
      批量重试{{ retryableCount ? `（${retryableCount}）` : "" }}
    </el-button>
    <el-button
      v-if="cmsUiEnabled"
      size="small"
      type="success"
      :loading="batchPublishing"
      :disabled="publishableCount === 0"
      @click="emit('batch-publish')"
    >
      批量推送 CMS{{ publishableCount ? `（${publishableCount}）` : "" }}
    </el-button>
    <el-button
      size="small"
      :loading="batchExporting"
      :disabled="exportableCount === 0"
      @click="emit('batch-export')"
    >
      批量导出{{ exportableCount ? `（${exportableCount}）` : "" }}
    </el-button>
    <el-button
      size="small"
      type="danger"
      :loading="batchDeleting"
      @click="emit('batch-delete')"
    >
      批量删除（{{ selectedCount }}）
    </el-button>
  </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SiteItem } from "@/api/seo-factory/types";
import type { JobListStage } from "@/composables/seo-factory/useJobListQuery";

defineOptions({ name: "JobListToolbar" });

type StageAlert = {
  type: "warning" | "info" | "error";
  title: string;
  description?: string;
};

const props = withDefaults(
  defineProps<{
  part?: "header" | "body";
  listFilter: JobListStage;
  filterSiteId: string;
  keywordSearch?: string;
  sites: SiteItem[];
  sitesLoading: boolean;
  polling: boolean;
  siteOwnerMeFilter: boolean;
  cmsUiEnabled: boolean;
  canCreateJob: boolean;
  stageAlert?: StageAlert | null;
  assignedToMeAlert?: StageAlert | null;
  siteOwnerMeAlert?: StageAlert | null;
  selectedCount?: number;
  briefApprovableCount?: number;
  retryableCount?: number;
  publishableCount?: number;
  exportableCount?: number;
  batchBriefApproving?: boolean;
  batchRetrying?: boolean;
  batchPublishing?: boolean;
  batchExporting?: boolean;
  batchDeleting?: boolean;
}>(),
  {
    part: "body",
    keywordSearch: "",
    stageAlert: null,
    assignedToMeAlert: null,
    siteOwnerMeAlert: null,
    selectedCount: 0,
    briefApprovableCount: 0,
    retryableCount: 0,
    publishableCount: 0,
    exportableCount: 0,
    batchBriefApproving: false,
    batchRetrying: false,
    batchPublishing: false,
    batchExporting: false,
    batchDeleting: false
  }
);

const emit = defineEmits<{
  refresh: [];
  create: [];
  "list-filter-change": [value: JobListStage];
  "site-filter-change": [value: string | undefined];
  "toggle-site-owner-filter": [checked: boolean | string | number];
  "update:keyword-search": [value: string];
  "keyword-search-input": [];
  "keyword-search-clear": [];
  "clear-list-filter": [];
  "batch-brief-approve": [];
  "batch-retry": [];
  "batch-publish": [];
  "batch-export": [];
  "batch-delete": [];
}>();

const activeAlert = computed(
  () => props.siteOwnerMeAlert ?? props.assignedToMeAlert ?? props.stageAlert
);

function onListFilterChange(value: JobListStage) {
  emit("list-filter-change", value);
}

function onSiteFilterUpdate(value: string | undefined) {
  emit("site-filter-change", value);
}

function toggleSiteOwnerFilter(checked: boolean | string | number) {
  emit("toggle-site-owner-filter", checked);
}

function onKeywordUpdate(value: string) {
  emit("update:keyword-search", value);
  emit("keyword-search-input");
}
</script>
