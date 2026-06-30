<!--
  Google 搜索表现：查看站点在 Google 上的点击、展示与排名（只读）。

  边界：
  - 不负责：GSC 授权与绑定（Console 平台管理员统一配置）
-->
<template>
  <div :class="embedded ? 'space-y-4' : 'p-4 space-y-4'">
    <component :is="embedded ? 'div' : 'el-card'" :shadow="embedded ? undefined : 'never'">
      <template v-if="!embedded" #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">Google 搜索表现</span>
          <el-button :loading="loading" @click="loadOverview">刷新</el-button>
        </div>
      </template>

      <div v-if="embedded" class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">Google 搜索表现</span>
        <el-button :loading="loading" @click="loadOverview">刷新</el-button>
      </div>

      <el-alert
        v-if="!gscEnabled"
        class="mb-4"
        type="warning"
        :closable="false"
        show-icon
        title="当前套餐未包含 Google Search Console 集成"
        description="请前往「订阅与用量」申请升级至标准版或企业版后使用。"
      />

      <el-alert
        v-else-if="!embedded"
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="这是什么？"
        description="展示站点在 Google 上的点击、展示与排名。搜索控制台由平台管理员统一配置，新建站点后会自动绑定；若长时间无数据请联系平台运营。"
      />

      <div v-loading="loading" class="space-y-4">
        <template v-if="gscEnabled">
          <el-card
            v-for="site in displaySites"
            :id="`gsc-site-${site.siteId}`"
            :key="site.siteId"
            shadow="never"
            class="border"
            :class="{ 'gsc-site-card--focus': focusSiteId === site.siteId }"
          >
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div v-if="!filterSiteId" class="font-medium">{{ site.domain }}</div>
                <div class="text-sm text-gray-500">
                  <template v-if="site.connected">
                    已连接 · {{ site.propertyUrl }}
                    <span v-if="site.lastSyncAt"> · 同步于 {{ formatTime(site.lastSyncAt) }}</span>
                    <span v-if="autoSyncing && syncingSiteId === site.siteId"> · 自动同步中…</span>
                  </template>
                  <template v-else>等待平台管理员绑定 Google Search Console</template>
                </div>
              </div>
              <div v-if="site.connected" class="flex flex-wrap gap-2">
                <el-button
                  :loading="syncingSiteId === site.siteId"
                  @click="handleSync(site.siteId)"
                >
                  刷新数据
                </el-button>
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
              description="可点击「刷新数据」拉取最近 28 天表现。"
            />

            <el-alert
              v-else-if="site.connected && !site.lastSyncAt"
              class="mb-3"
              type="info"
              :closable="false"
              show-icon
              title="尚未同步搜索数据"
              description="绑定成功后会自动尝试首次同步；若仍无数据，请点击「刷新数据」。"
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
              description="已连接，正在等待搜索数据（会自动同步，也可手动刷新）"
            />
          </el-card>
        </template>
      </div>

      <el-empty
        v-if="gscEnabled && !loading && displaySites.length === 0"
        :description="filterSiteId ? '该站点暂无搜索数据' : '请先在「站点」创建站点'"
      />
    </component>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { getOrgEntitlements } from "@/api/org/billing";
import {
  formatGscPercent,
  formatGscPosition,
  getProjectGscOverview,
  isGscSyncStale,
  syncSiteGsc,
  type ProjectGscSiteOverview
} from "@/api/seo-factory/gsc";
import { message } from "@/utils/message";

defineOptions({ name: "GscPerformanceView" });

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    filterSiteId?: string;
  }>(),
  { embedded: false, filterSiteId: "" }
);

const route = useRoute();
const projectId = route.params.projectId as string;

const focusSiteId = computed(() => {
  if (props.filterSiteId) return props.filterSiteId;
  const siteId = route.query.siteId;
  return typeof siteId === "string" ? siteId : "";
});

const loading = ref(false);
const gscEnabled = ref(true);
const sites = ref<ProjectGscSiteOverview[]>([]);
const displaySites = computed(() => {
  if (!props.filterSiteId) return sites.value;
  return sites.value.filter((site) => site.siteId === props.filterSiteId);
});
const syncingSiteId = ref<string | null>(null);
const autoSyncing = ref(false);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function loadOverview() {
  loading.value = true;
  try {
    sites.value = await getProjectGscOverview(projectId);
    await scrollToFocusSite();
  } finally {
    loading.value = false;
  }
}

async function scrollToFocusSite() {
  if (!focusSiteId.value) return;
  await nextTick();
  document.getElementById(`gsc-site-${focusSiteId.value}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function autoSyncStaleSites() {
  const scope = props.filterSiteId
    ? sites.value.filter((site) => site.siteId === props.filterSiteId)
    : sites.value;
  const targets = scope.filter(
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

async function handleSync(siteId: string) {
  syncingSiteId.value = siteId;
  try {
    await syncSiteGsc(projectId, siteId);
    message("搜索数据已刷新", { type: "success" });
    await loadOverview();
  } catch (error) {
    message(error instanceof Error ? error.message : "刷新失败", { type: "error" });
    await loadOverview();
  } finally {
    syncingSiteId.value = null;
  }
}

onMounted(async () => {
  try {
    const ent = await getOrgEntitlements();
    gscEnabled.value = ent.gscEnabled;
  } catch {
    gscEnabled.value = false;
  }
  if (!gscEnabled.value) return;
  await loadOverview();
  void autoSyncStaleSites();
});

watch(focusSiteId, () => {
  void scrollToFocusSite();
});
</script>

<style scoped>
.gsc-site-card--focus {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
}
</style>
