<!--
  Console 全站站点总览：跨企业查看站点健康度、GSC 平台授权与站点绑定同步。
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="平台代运营视图"
      description="横切所有企业与站点，查看写作素材、发布集成与 Google 搜索状态；在下方完成平台授权后，可为各站点绑定并同步 Search Console 数据。"
    />

    <ConsolePlatformGscAuthCard v-if="canManageGsc" />

    <el-alert
      v-else-if="gscPlatformDisconnected"
      type="warning"
      :closable="false"
      show-icon
      title="平台 Google 授权未完成"
      description="请联系具备 GSC 集成管理权限的平台运营完成 Google 授权后，再为站点绑定搜索数据。"
    />

    <el-alert
      v-if="organizationIdFromRoute"
      type="info"
      :closable="false"
      show-icon
      class="mb-0"
      :title="`当前仅显示企业站点（ID: ${organizationIdFromRoute.slice(0, 8)}…）`"
    >
      <template #default>
        <router-link to="/console/sites" class="text-primary text-sm">查看全平台站点</router-link>
      </template>
    </el-alert>

    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">全站站点</span>
          <div class="flex flex-wrap gap-2">
            <div class="hidden sm:flex flex-wrap gap-2">
              <el-input
                v-model="keyword"
                placeholder="搜索域名/企业/项目"
                clearable
                style="width: 200px"
                @keyup.enter="searchSites"
              />
              <el-select
                v-model="profileReadyFilter"
                placeholder="写作素材"
                clearable
                style="width: 130px"
                @change="searchSites"
              >
                <el-option label="已达标" value="true" />
                <el-option label="待完善" value="false" />
              </el-select>
              <el-select
                v-model="gscConnectedFilter"
                placeholder="GSC 绑定"
                clearable
                style="width: 120px"
                @change="searchSites"
              >
                <el-option label="已绑定" value="true" />
                <el-option label="未绑定" value="false" />
              </el-select>
              <el-button @click="searchSites">搜索</el-button>
            </div>
            <el-button class="sm:hidden" @click="filterDrawerVisible = true">筛选</el-button>
            <el-button @click="loadSites">刷新</el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!loading && sites.length === 0" description="暂无站点" />
      <el-table v-else :data="sites" stripe>
        <el-table-column prop="domain" label="域名" min-width="160" />
        <el-table-column prop="organizationName" label="企业" min-width="140">
          <template #default="{ row }">
            <router-link
              :to="`/console/tenants/${row.organizationId}`"
              class="text-primary text-sm"
            >
              {{ row.organizationName }}
            </router-link>
          </template>
        </el-table-column>
        <el-table-column prop="projectName" label="项目" min-width="120" />
        <el-table-column label="写作素材" width="96">
          <template #default="{ row }">
            <el-tag :type="row.profileReady ? 'success' : 'warning'" size="small">
              {{ row.profileReady ? "已达标" : "待完善" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布集成" width="108">
          <template #default="{ row }">
            <span v-if="!row.cmsType" class="text-xs text-gray-400">未配置</span>
            <el-tag v-else :type="row.cmsConfigured ? 'success' : 'warning'" size="small">
              {{ row.cmsType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="套餐 GSC" width="88">
          <template #default="{ row }">
            <el-tag :type="row.gscEnabled ? 'success' : 'info'" size="small">
              {{ row.gscEnabled ? "已开通" : "未开通" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Google 搜索" width="108">
          <template #default="{ row }">
            <el-tooltip :content="gscHint(siteRow(row))" placement="top">
              <el-tag :type="gscTagType(siteRow(row).gsc.status)" size="small">
                {{ gscLabel(siteRow(row).gsc.status) }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="最近同步" width="148">
          <template #default="{ row }">
            <span v-if="row.gsc.lastSyncAt" class="text-xs">{{ formatGscTime(row.gsc.lastSyncAt) }}</span>
            <span v-else class="text-xs text-gray-400">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="jobCount" label="任务数" width="80" align="right" />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <div class="hidden sm:flex flex-wrap gap-1">
              <el-button link type="primary" @click="goDiagnostics(siteRow(row))">项目诊断</el-button>
              <template v-if="siteRow(row).gscEnabled">
                <el-button
                  v-if="siteRow(row).gsc.status === 'unbound'"
                  link
                  type="primary"
                  :loading="actingSiteId === siteRow(row).siteId"
                  @click="handleConnectSite(siteRow(row).siteId)"
                >
                  绑定
                </el-button>
                <template v-else-if="siteRow(row).gsc.status !== 'not_enabled'">
                  <el-button
                    link
                    type="primary"
                    :loading="actingSiteId === siteRow(row).siteId"
                    @click="handleSyncSite(siteRow(row).siteId)"
                  >
                    同步
                  </el-button>
                </template>
              </template>
            </div>
            <el-dropdown
              class="sm:hidden"
              trigger="click"
              @command="(cmd) => onSiteRowCommand(cmd, siteRow(row))"
            >
              <el-button link type="primary">操作</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="diagnostics">项目诊断</el-dropdown-item>
                  <el-dropdown-item
                    v-if="siteRow(row).gscEnabled && siteRow(row).gsc.status === 'unbound'"
                    command="connect"
                  >
                    绑定 GSC
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="
                      siteRow(row).gscEnabled &&
                      siteRow(row).gsc.status !== 'not_enabled' &&
                      siteRow(row).gsc.status !== 'unbound'
                    "
                    command="sync"
                  >
                    同步 GSC
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="total > limit" class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadSites"
        />
      </div>
    </el-card>

    <el-drawer v-model="filterDrawerVisible" title="筛选站点" size="320px" destroy-on-close>
      <div class="space-y-4">
        <el-input
          v-model="keyword"
          placeholder="搜索域名/企业/项目"
          clearable
          @keyup.enter="applyMobileFilters"
        />
        <el-select v-model="profileReadyFilter" placeholder="写作素材" clearable class="w-full">
          <el-option label="已达标" value="true" />
          <el-option label="待完善" value="false" />
        </el-select>
        <el-select v-model="gscConnectedFilter" placeholder="GSC 绑定" clearable class="w-full">
          <el-option label="已绑定" value="true" />
          <el-option label="未绑定" value="false" />
        </el-select>
        <div class="flex gap-2">
          <el-button type="primary" @click="applyMobileFilters">应用</el-button>
          <el-button @click="filterDrawerVisible = false">关闭</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  connectConsoleGscSite,
  getConsoleGscStatus,
  syncConsoleGscSite
} from "@/api/console/gsc";
import type { ConsoleSiteOverviewRow } from "@/api/console/sites";
import { useConsoleSiteOverview } from "@/composables/console/useConsoleSiteOverview";
import { message } from "@/utils/message";
import { hasPerms } from "@/utils/auth";
import { tableRow } from "@/utils/table-row";
import {
  getSiteGscStatusHint,
  getSiteGscStatusLabel,
  getSiteGscStatusTagType
} from "@/utils/seo-factory/site-gsc-display";
import ConsolePlatformGscAuthCard from "./components/ConsolePlatformGscAuthCard.vue";

defineOptions({ name: "ConsoleSiteOverviewView" });

const route = useRoute();
const router = useRouter();
const canManageGsc = computed(() => hasPerms("console:gsc:manage"));
const gscPlatformDisconnected = ref(false);
const organizationIdFromRoute = computed(() => {
  const org = route.query.organizationId;
  return typeof org === "string" && org ? org : undefined;
});

const {
  loading,
  sites,
  keyword,
  profileReadyFilter,
  gscConnectedFilter,
  page,
  limit,
  total,
  loadSites,
  searchSites
} = useConsoleSiteOverview({ organizationId: organizationIdFromRoute });

function siteRow(row: unknown): ConsoleSiteOverviewRow {
  return tableRow<ConsoleSiteOverviewRow>(row);
}

function gscLabel(status: ConsoleSiteOverviewRow["gsc"]["status"]) {
  return getSiteGscStatusLabel(status);
}

function gscTagType(status: ConsoleSiteOverviewRow["gsc"]["status"]) {
  return getSiteGscStatusTagType(status);
}

function gscHint(row: ConsoleSiteOverviewRow) {
  if (!row.gscEnabled) return "当前套餐未开通 Google 搜索表现";
  return getSiteGscStatusHint(row.gsc);
}

function goDiagnostics(row: ConsoleSiteOverviewRow) {
  void router.push({
    name: "ConsoleProjectDiagnostics",
    query: {
      organizationId: row.organizationId,
      projectId: row.projectId
    }
  });
}

const actingSiteId = ref<string | null>(null);
const filterDrawerVisible = ref(false);

function applyMobileFilters() {
  filterDrawerVisible.value = false;
  searchSites();
}

function onSiteRowCommand(command: string, row: ConsoleSiteOverviewRow) {
  if (command === "diagnostics") {
    goDiagnostics(row);
    return;
  }
  if (command === "connect") {
    void handleConnectSite(row.siteId);
    return;
  }
  if (command === "sync") {
    void handleSyncSite(row.siteId);
  }
}

function formatGscTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function handleConnectSite(siteId: string) {
  actingSiteId.value = siteId;
  try {
    const result = await connectConsoleGscSite(siteId);
    if (result.connected) {
      message("站点已绑定", { type: "success" });
    } else {
      message("未能匹配 GSC 资源，请确认该域名已在 Google Search Console 中", {
        type: "warning"
      });
    }
    await loadSites();
  } finally {
    actingSiteId.value = null;
  }
}

async function handleSyncSite(siteId: string) {
  actingSiteId.value = siteId;
  try {
    await syncConsoleGscSite(siteId);
    message("搜索数据已同步", { type: "success" });
    await loadSites();
  } catch (error) {
    message(error instanceof Error ? error.message : "同步失败", { type: "error" });
    await loadSites();
  } finally {
    actingSiteId.value = null;
  }
}

onMounted(() => {
  const keywordFromRoute = route.query.keyword;
  if (typeof keywordFromRoute === "string" && keywordFromRoute.trim()) {
    keyword.value = keywordFromRoute.trim();
  }
  if (!canManageGsc.value) {
    void getConsoleGscStatus()
      .then((status) => {
        gscPlatformDisconnected.value = !status.platformConnected;
      })
      .catch(() => {
        gscPlatformDisconnected.value = false;
      });
  }
  void loadSites();
});
</script>
