<!--
  站点页面库：Sitemap 同步与内链候选页列表。

  边界：
  - 不负责：内链植入（后端 LinkingService）
-->
<template>
  <el-card shadow="never">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">页面库 · {{ siteDomain || "未选站点" }}</span>
        <div class="flex gap-2">
          <el-button :loading="pagesLoading" :disabled="!siteId" @click="loadPages">刷新</el-button>
          <el-button type="primary" :loading="syncing" :disabled="!siteId" @click="handleSync">
            从 Sitemap 同步
          </el-button>
        </div>
      </div>
    </template>

    <el-alert
      class="mb-4"
      type="info"
      :closable="false"
      show-icon
      title="内链候选页"
      description="同步网站已有页面列表，供文章自动插入站内链接；首次配置站点后建议同步一次。"
    />

    <el-table v-loading="pagesLoading" :data="pages" stripe>
      <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
      <el-table-column prop="url" label="URL" min-width="260">
        <template #default="{ row }">
          <el-link :href="row.url" target="_blank" type="primary">
            {{ row.url }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column prop="pageType" label="类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="dictTagType(sitePageTypeDict, row.pageType)">
            {{ dictLabel(sitePageTypeDict, row.pageType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主关键词" min-width="160">
        <template #default="{ row }">
          <el-input
            :model-value="row.primaryKeyword ?? ''"
            size="small"
            placeholder="页面主词"
            maxlength="200"
            @blur="(event: FocusEvent) => savePrimaryKeyword(row, (event.target as HTMLInputElement).value)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="businessValue" label="业务权重" width="100">
        <template #default="{ row }">
          {{ formatWeight(row.businessValue) }}
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" min-width="170">
        <template #default="{ row }">
          {{ formatTime(row.updatedAt) }}
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!pagesLoading && pages.length === 0" description="页面库为空，请点击「从 Sitemap 同步」" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { listSitePages, patchSitePage, syncSitePages } from "@/api/seo-factory/site";
import type { SitePageItem } from "@/api/seo-factory/types";
import { sitePageTypeDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "SitePageLibraryPanel" });

const props = defineProps<{
  projectId: string;
  siteId: string;
  siteDomain?: string;
}>();

const pagesLoading = ref(false);
const syncing = ref(false);
const pages = ref<SitePageItem[]>([]);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function formatWeight(value: number) {
  if (typeof value !== "number") return "-";
  return value.toFixed(2);
}

async function loadPages() {
  if (!props.siteId) {
    pages.value = [];
    return;
  }

  pagesLoading.value = true;
  try {
    pages.value = await listSitePages(props.projectId, props.siteId);
  } catch (error) {
    message(error instanceof Error ? error.message : "加载页面库失败", { type: "error" });
  } finally {
    pagesLoading.value = false;
  }
}

async function handleSync() {
  if (!props.siteId || syncing.value) return;

  syncing.value = true;
  try {
    const result = await syncSitePages(props.projectId, props.siteId);
    message(`同步完成：发现 ${result.discovered} 条，写入 ${result.upserted} 条`, {
      type: "success"
    });
    await loadPages();
  } catch (error) {
    message(error instanceof Error ? error.message : "同步失败", { type: "error" });
  } finally {
    syncing.value = false;
  }
}

async function savePrimaryKeyword(row: SitePageItem, value: string) {
  if (!props.siteId) return;

  try {
    const updated = await patchSitePage(props.projectId, props.siteId, row.id, {
      primaryKeyword: value.trim() || null
    });
    const index = pages.value.findIndex((item) => item.id === row.id);
    if (index >= 0) {
      pages.value[index] = updated;
    }
    message("主关键词已保存", { type: "success" });
  } catch (error) {
    message(error instanceof Error ? error.message : "保存失败", { type: "error" });
  }
}

watch(
  () => props.siteId,
  () => {
    void loadPages();
  },
  { immediate: true }
);
</script>
