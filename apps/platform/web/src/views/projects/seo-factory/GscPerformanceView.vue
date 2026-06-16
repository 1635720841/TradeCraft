<!--
  Google 搜索表现：连接 GSC、同步并查看页面/查询数据。

  边界：
  - 不负责：CMS 推送（SiteManageView / JobListView）
-->
<template>
  <div :class="embedded ? 'space-y-4' : 'p-4 space-y-4'">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">Google 搜索表现</span>
          <el-button :loading="loading" @click="loadOverview">刷新</el-button>
        </div>
      </template>

      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="这是什么？"
        description="连接 Google 搜索控制台后，可查看站点在 Google 上的点击、展示与排名。需管理员在服务器完成 Google 授权配置；未配置时请联系管理员开通。"
      />

      <div v-loading="loading" class="space-y-4">
        <el-card v-for="site in sites" :key="site.siteId" shadow="never" class="border">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="font-medium">{{ site.domain }}</div>
              <div class="text-sm text-gray-500">
                <template v-if="site.connected">
                  已连接 · {{ site.propertyUrl }}
                  <span v-if="site.lastSyncAt"> · 同步于 {{ formatTime(site.lastSyncAt) }}</span>
                  <span v-if="autoSyncing && syncingSiteId === site.siteId"> · 自动同步中…</span>
                </template>
                <template v-else>未连接 Google Search Console</template>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <el-button
                v-if="!site.connected"
                type="primary"
                :loading="connectingSiteId === site.siteId"
                @click="handleConnect(site.siteId)"
              >
                连接 Google
              </el-button>
              <template v-else>
                <el-button
                  :loading="syncingSiteId === site.siteId"
                  @click="handleSync(site.siteId)"
                >
                  同步数据
                </el-button>
                <el-button
                  type="danger"
                  link
                  :loading="disconnectingSiteId === site.siteId"
                  @click="handleDisconnect(site.siteId)"
                >
                  断开
                </el-button>
              </template>
            </div>
          </div>

          <el-alert
            v-if="site.lastSyncError"
            class="mb-3"
            type="error"
            :closable="false"
            show-icon
            :title="site.lastSyncError"
          />

          <el-alert
            v-else-if="site.connected && isGscSyncStale(site.lastSyncAt)"
            class="mb-3"
            type="warning"
            :closable="false"
            show-icon
            title="搜索数据可能已过期"
            description="建议点击「同步数据」拉取最近 28 天表现。"
          />

          <el-alert
            v-else-if="site.connected && !site.lastSyncAt"
            class="mb-3"
            type="info"
            :closable="false"
            show-icon
            title="尚未同步搜索数据"
            description="连接成功后会自动尝试首次同步；若仍无数据，请点击「同步数据」。"
          />

          <template v-if="site.summary">
            <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded border px-3 py-2">
                <div class="text-xs text-gray-500">近 {{ site.summary.periodDays }} 天点击</div>
                <div class="text-xl font-semibold">{{ site.summary.totals.clicks }}</div>
              </div>
              <div class="rounded border px-3 py-2">
                <div class="text-xs text-gray-500">展示</div>
                <div class="text-xl font-semibold">{{ site.summary.totals.impressions }}</div>
              </div>
              <div class="rounded border px-3 py-2">
                <div class="text-xs text-gray-500">点击率</div>
                <div class="text-xl font-semibold">{{ formatGscPercent(site.summary.totals.ctr) }}</div>
              </div>
              <div class="rounded border px-3 py-2">
                <div class="text-xs text-gray-500">平均排名</div>
                <div class="text-xl font-semibold">{{ formatGscPosition(site.summary.totals.position) }}</div>
              </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <div>
                <div class="mb-2 text-sm font-medium">热门页面</div>
                <el-table :data="site.summary.topPages" size="small" stripe max-height="280">
                  <el-table-column prop="page" label="页面" min-width="180" show-overflow-tooltip />
                  <el-table-column label="关联任务" width="120">
                    <template #default="{ row }">
                      <router-link
                        v-if="row.matchedJobId"
                        :to="{
                          name: 'SeoFactoryJobDetail',
                          params: { projectId, jobId: row.matchedJobId }
                        }"
                        class="text-[var(--el-color-primary)] text-xs"
                      >
                        {{ row.matchedKeyword || '查看' }}
                      </router-link>
                      <span v-else class="text-xs text-gray-400">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column prop="clicks" label="点击" width="70" />
                  <el-table-column prop="impressions" label="展示" width="70" />
                  <el-table-column label="排名" width="70">
                    <template #default="{ row }">{{ formatGscPosition(row.position) }}</template>
                  </el-table-column>
                </el-table>
              </div>
              <div>
                <div class="mb-2 text-sm font-medium">热门搜索词</div>
                <el-table :data="site.summary.topQueries" size="small" stripe max-height="280">
                  <el-table-column prop="query" label="查询词" min-width="140" show-overflow-tooltip />
                  <el-table-column prop="clicks" label="点击" width="70" />
                  <el-table-column prop="impressions" label="展示" width="70" />
                  <el-table-column label="排名" width="70">
                    <template #default="{ row }">{{ formatGscPosition(row.position) }}</template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </template>

          <el-empty
            v-else-if="site.connected"
            description="已连接，正在等待搜索数据（连接后会自动同步，也可手动点「同步数据」）"
          />
        </el-card>
      </div>

      <el-empty v-if="!loading && sites.length === 0" description="请先在「站点管理」创建站点" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessageBox } from "element-plus";
import {
  disconnectSiteGsc,
  formatGscPercent,
  formatGscPosition,
  getGscConnectUrl,
  getProjectGscOverview,
  isGscSyncStale,
  syncSiteGsc,
  type ProjectGscSiteOverview
} from "@/api/seo-factory/gsc";
import { message } from "@/utils/message";

defineOptions({ name: "GscPerformanceView" });

withDefaults(
  defineProps<{
    embedded?: boolean;
  }>(),
  { embedded: false }
);

const route = useRoute();
const projectId = route.params.projectId as string;

const loading = ref(false);
const sites = ref<ProjectGscSiteOverview[]>([]);
const connectingSiteId = ref<string | null>(null);
const syncingSiteId = ref<string | null>(null);
const disconnectingSiteId = ref<string | null>(null);
const autoSyncing = ref(false);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadOverview() {
  loading.value = true;
  try {
    sites.value = await getProjectGscOverview(projectId);
  } finally {
    loading.value = false;
  }
}

async function autoSyncStaleSites() {
  const targets = sites.value.filter(
    (site) =>
      site.connected &&
      !site.lastSyncError &&
      (!site.lastSyncAt || isGscSyncStale(site.lastSyncAt))
  );
  if (targets.length === 0) return;

  autoSyncing.value = true;
  let synced = 0;
  try {
    for (const site of targets) {
      syncingSiteId.value = site.siteId;
      try {
        await syncSiteGsc(projectId, site.siteId);
        synced += 1;
      } catch {
        // 单站失败不阻断其余站点
      }
    }
    if (synced > 0) {
      message(`已自动更新 ${synced} 个站点的搜索数据`, { type: "success" });
      await loadOverview();
    }
  } finally {
    syncingSiteId.value = null;
    autoSyncing.value = false;
  }
}

async function handleConnect(siteId: string) {
  connectingSiteId.value = siteId;
  try {
    const { authUrl } = await getGscConnectUrl(projectId, siteId);
    window.location.href = authUrl;
  } catch (error) {
    message(error instanceof Error ? error.message : "无法发起 Google 授权", { type: "error" });
  } finally {
    connectingSiteId.value = null;
  }
}

async function handleSync(siteId: string) {
  syncingSiteId.value = siteId;
  try {
    await syncSiteGsc(projectId, siteId);
    message("搜索数据已同步", { type: "success" });
    await loadOverview();
  } catch (error) {
    message(error instanceof Error ? error.message : "同步失败", { type: "error" });
    await loadOverview();
  } finally {
    syncingSiteId.value = null;
  }
}

async function handleDisconnect(siteId: string) {
  await ElMessageBox.confirm("断开后需重新授权才能再次查看搜索数据。", "确认断开", {
    type: "warning"
  });
  disconnectingSiteId.value = siteId;
  try {
    await disconnectSiteGsc(projectId, siteId);
    message("已断开 Google Search Console", { type: "success" });
    await loadOverview();
  } finally {
    disconnectingSiteId.value = null;
  }
}

onMounted(async () => {
  if (route.query.gsc === "connected") {
    message("Google Search Console 已连接，正在拉取搜索数据…", { type: "success" });
  }
  await loadOverview();
  void autoSyncStaleSites();
});
</script>
