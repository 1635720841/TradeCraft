<!--
  Console 全站站点总览：跨企业查看站点健康度与快捷运营入口。

  边界：
  - 不负责：GSC OAuth 与绑定操作（ConsoleGscView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="平台代运营视图"
      description="横切所有企业与站点，查看写作素材、发布集成与 Google 搜索状态。绑定与同步请在「搜索表现」页操作。"
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
            <el-button @click="loadSites">刷新</el-button>
            <el-button plain @click="router.push('/console/gsc')">搜索表现管理</el-button>
          </div>
        </div>
      </template>

      <el-table :data="sites" stripe>
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
        <el-table-column label="Google 搜索" width="108">
          <template #default="{ row }">
            <el-tooltip :content="gscHint(row)" placement="top">
              <el-tag :type="gscTagType(row.gsc.status)" size="small">
                {{ gscLabel(row.gsc.status) }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="jobCount" label="任务数" width="80" align="right" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goDiagnostics(row)">项目诊断</el-button>
            <el-button link type="primary" @click="goGscManage(row)">GSC</el-button>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { ConsoleSiteOverviewRow } from "@/api/console/sites";
import { useConsoleSiteOverview } from "@/composables/console/useConsoleSiteOverview";
import {
  getSiteGscStatusHint,
  getSiteGscStatusLabel,
  getSiteGscStatusTagType
} from "@/utils/seo-factory/site-gsc-display";

defineOptions({ name: "ConsoleSiteOverviewView" });

const route = useRoute();
const router = useRouter();
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

function goGscManage(row: ConsoleSiteOverviewRow) {
  void router.push({
    path: "/console/gsc",
    query: { keyword: row.domain }
  });
}

onMounted(() => {
  void loadSites();
});
</script>
