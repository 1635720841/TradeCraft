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
        <div class="flex flex-wrap items-center gap-2">
          <el-checkbox v-model="includeInactive" @change="onIncludeInactiveChange">
            显示已下线
          </el-checkbox>
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
      description="创建站点后会自动从 Sitemap 同步页面列表，供文章自动插入站内链接；也可手动点击同步。"
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
      <el-table-column v-if="includeInactive" label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.active ? 'success' : 'info'">
            {{ row.active ? "在线" : "已下线" }}
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
            :disabled="!row.active"
            @blur="(event: FocusEvent) => savePrimaryKeyword(row, (event.target as HTMLInputElement).value)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="businessValue" label="业务权重" width="100">
        <template #default="{ row }">
          {{ formatWeight(row.businessValue) }}
        </template>
      </el-table-column>
      <el-table-column label="页面更新时间" min-width="170">
        <template #default="{ row }">
          {{ formatOptionalTime(row.lastUpdated) }}
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > 0" class="mt-4 flex justify-end">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="limit"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="loadPages"
        @size-change="onSizeChange"
      />
    </div>

    <el-empty v-if="!pagesLoading && pages.length === 0" description="页面库为空，创建站点后会自动同步，也可手动点击「从 Sitemap 同步」" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { listSitePages, patchSitePage, syncSitePages } from "@/api/seo-factory/site";
import type { SitePageItem, SitePageSyncResult } from "@/api/seo-factory/types";
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
const page = ref(1);
const limit = ref(20);
const total = ref(0);
const includeInactive = ref(false);

function formatOptionalTime(iso?: string | null) {
  if (!iso) return "-";
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
    const res = await listSitePages(
      props.projectId,
      props.siteId,
      page.value,
      limit.value,
      includeInactive.value
    );
    pages.value = res.data ?? [];
    total.value = res.meta?.pagination?.total ?? pages.value.length;
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
    message(formatSyncMessage(result), { type: "success" });
    page.value = 1;
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

function onSizeChange() {
  page.value = 1;
  void loadPages();
}

function onIncludeInactiveChange() {
  page.value = 1;
  void loadPages();
}

function formatSyncMessage(result: SitePageSyncResult) {
  const parts = [
    `sitemap 共 ${result.discovered} 条`,
    `写入 ${result.upserted} 条`
  ];
  if (result.skipped > 0) {
    parts.push(`跳过 ${result.skipped} 条（超出同步上限）`);
  }
  if (result.deactivated > 0) {
    parts.push(`下线 ${result.deactivated} 条`);
  }
  if (result.reactivated > 0) {
    parts.push(`恢复 ${result.reactivated} 条`);
  }
  return `同步完成：${parts.join("，")}`;
}

watch(
  () => props.siteId,
  () => {
    page.value = 1;
    void loadPages();
  },
  { immediate: true }
);
</script>
