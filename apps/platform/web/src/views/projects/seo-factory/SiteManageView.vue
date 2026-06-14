<!--
  站点与页面库管理：查看站点、同步 sitemap 页面供内链匹配。

  边界：
  - 不负责：站点 CRUD（后端 MVP 仅列表 + 同步）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">站点与页面库</span>
          <div class="flex gap-2">
            <el-button @click="goJobs">返回任务列表</el-button>
            <el-button :loading="sitesLoading" @click="loadSites">刷新站点</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="sitesLoading" :data="sites" stripe>
        <el-table-column prop="domain" label="域名" min-width="180" />
        <el-table-column prop="targetMarket" label="目标市场" width="100">
          <template #default="{ row }">
            {{ row.targetMarket || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="contentLanguage" label="语言" width="100">
          <template #default="{ row }">
            {{ row.contentLanguage || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              @click="selectSite(row.id)"
            >
              管理页面库
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!sitesLoading && sites.length === 0" description="暂无站点，请先执行 pnpm db:seed" />
    </el-card>

    <el-card v-if="selectedSite" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">页面库 · {{ selectedSite.domain }}</span>
          <div class="flex gap-2">
            <el-button :loading="pagesLoading" @click="loadPages">刷新</el-button>
            <el-button type="primary" :loading="syncing" @click="handleSync">
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
        description="同步后供 M8 内链模块自动匹配；任务运行中若库为空会自动触发一次同步。"
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
        <el-table-column prop="businessValue" label="业务权重" width="100">
          <template #default="{ row }">
            {{ formatWeight(row.businessValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="keywords" label="关键词" min-width="160">
          <template #default="{ row }">
            {{ (row.keywords ?? []).slice(0, 3).join("、") || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="90" />
        <el-table-column prop="updatedAt" label="更新时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!pagesLoading && pages.length === 0" description="页面库为空，请点击「从 Sitemap 同步」" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listSitePages, listSites, syncSitePages } from "@/api/seo-factory/site";
import type { SiteItem, SitePageItem } from "@/api/seo-factory/types";
import { sitePageTypeDict } from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "SiteManageView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const sitesLoading = ref(false);
const pagesLoading = ref(false);
const syncing = ref(false);
const sites = ref<SiteItem[]>([]);
const pages = ref<SitePageItem[]>([]);
const selectedSiteId = ref("");

const selectedSite = computed(() =>
  sites.value.find((site) => site.id === selectedSiteId.value) ?? null
);

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
    if (!selectedSiteId.value && sites.value.length > 0) {
      selectedSiteId.value = sites.value[0].id;
      await loadPages();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "加载站点失败";
    message(msg, { type: "error" });
  } finally {
    sitesLoading.value = false;
  }
}

async function loadPages() {
  if (!selectedSiteId.value) {
    pages.value = [];
    return;
  }

  pagesLoading.value = true;
  try {
    pages.value = await listSitePages(projectId, selectedSiteId.value);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "加载页面库失败";
    message(msg, { type: "error" });
  } finally {
    pagesLoading.value = false;
  }
}

async function selectSite(siteId: string) {
  selectedSiteId.value = siteId;
  await loadPages();
}

async function handleSync() {
  if (!selectedSiteId.value || syncing.value) return;

  syncing.value = true;
  try {
    const result = await syncSitePages(projectId, selectedSiteId.value);
    message(
      `同步完成：发现 ${result.discovered} 条，写入 ${result.upserted} 条`,
      { type: "success" }
    );
    await loadPages();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "同步失败";
    message(msg, { type: "error" });
  } finally {
    syncing.value = false;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function formatWeight(value: number) {
  if (typeof value !== "number") return "-";
  return value.toFixed(2);
}

function goJobs() {
  router.push({ name: "SeoFactoryJobs", params: { projectId } });
}

onMounted(() => {
  void loadSites();
});
</script>
