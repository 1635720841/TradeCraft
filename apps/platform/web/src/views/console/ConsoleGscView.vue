<!--

  Console 搜索表现：平台统一 Google 授权与全站绑定（管理端）。

-->

<template>

  <div class="p-4 space-y-4">

    <el-alert

      type="info"

      :closable="false"

      show-icon

      title="平台统一配置"

      description="在此完成一次 Google 授权后，新建站点将自动匹配 Search Console 资源。企业用户无需自行连接。"

    />



    <el-card v-loading="loadingStatus" shadow="never">

      <template #header>

        <div class="flex flex-wrap items-center justify-between gap-2">

          <span class="font-medium">平台 Google 授权</span>

          <div class="flex flex-wrap gap-2">

            <el-button @click="loadStatus">刷新</el-button>

            <el-button

              v-if="!status?.platformConnected"

              type="primary"

              :loading="connecting"

              :disabled="!status?.oauthConfigured"

              @click="handleConnect"

            >

              连接 Google

            </el-button>

            <el-button

              v-else

              type="danger"

              link

              :loading="disconnecting"

              @click="handleDisconnectPlatform"

            >

              断开平台授权

            </el-button>

          </div>

        </div>

      </template>



      <el-alert

        v-if="status && !status.oauthConfigured"

        type="warning"

        :closable="false"

        show-icon

        title="OAuth 未配置"

        description="请先在服务器配置 GOOGLE_GSC_CLIENT_ID / SECRET / REDIRECT_URI。"

      />



      <dl v-else-if="status" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

        <div>

          <dt class="text-xs text-[var(--mw-text-muted)]">授权状态</dt>

          <dd class="font-medium">{{ status.platformConnected ? "已连接" : "未连接" }}</dd>

        </div>

        <div>

          <dt class="text-xs text-[var(--mw-text-muted)]">Google 账号</dt>

          <dd class="font-medium">{{ status.googleEmail || "—" }}</dd>

        </div>

        <div>

          <dt class="text-xs text-[var(--mw-text-muted)]">GSC 资源数</dt>

          <dd class="font-medium">{{ status.propertyCount ?? "—" }}</dd>

        </div>

        <div>

          <dt class="text-xs text-[var(--mw-text-muted)]">授权时间</dt>

          <dd class="font-medium">{{ status.connectedAt ? formatTime(status.connectedAt) : "—" }}</dd>

        </div>

      </dl>

    </el-card>



    <el-card v-loading="loadingSites" shadow="never">

      <template #header>

        <div class="flex flex-wrap items-center justify-between gap-2">

          <span class="font-medium">全平台站点绑定</span>

          <div class="flex flex-wrap gap-2">

            <el-select v-model="connectedFilter" style="width: 120px" @change="loadSites">

              <el-option label="全部" value="" />

              <el-option label="已连接" value="true" />

              <el-option label="未连接" value="false" />

            </el-select>

            <el-input

              v-model="keyword"

              placeholder="搜索域名/企业/项目"

              clearable

              class="w-52"

              @keyup.enter="searchSites"

            />

            <el-button @click="searchSites">搜索</el-button>

            <el-button

              type="primary"

              :loading="autoConnecting"

              :disabled="!status?.platformConnected"

              @click="handleAutoConnectAll"

            >

              批量绑定未连接站点

            </el-button>

          </div>

        </div>

      </template>



      <el-table :data="sites" stripe>

        <el-table-column prop="domain" label="域名" min-width="160" />

        <el-table-column prop="organizationName" label="企业" min-width="140" />

        <el-table-column prop="projectName" label="项目" min-width="120" />

        <el-table-column label="套餐 GSC" width="90">

          <template #default="{ row }">

            <el-tag :type="row.gscEnabled ? 'success' : 'info'" size="small">

              {{ row.gscEnabled ? "已开通" : "未开通" }}

            </el-tag>

          </template>

        </el-table-column>

        <el-table-column label="绑定状态" width="120">

          <template #default="{ row }">

            <div class="flex flex-wrap items-center gap-1">

              <el-tag :type="row.connected ? 'success' : 'warning'" size="small">

                {{ row.connected ? "已连接" : "未连接" }}

              </el-tag>

              <el-tag v-if="row.managedByPlatform" type="info" size="small">平台</el-tag>

            </div>

          </template>

        </el-table-column>

        <el-table-column prop="propertyUrl" label="GSC 资源" min-width="160" show-overflow-tooltip />

        <el-table-column label="最近同步" width="160">

          <template #default="{ row }">

            {{ row.lastSyncAt ? formatTime(row.lastSyncAt) : "—" }}

          </template>

        </el-table-column>

        <el-table-column label="同步状态" min-width="140" show-overflow-tooltip>

          <template #default="{ row }">

            <span v-if="row.lastSyncError" class="text-[var(--el-color-danger)]">{{ row.lastSyncError }}</span>

            <span v-else-if="row.connected" class="text-[var(--mw-text-muted)]">正常</span>

            <span v-else class="text-[var(--mw-text-muted)]">—</span>

          </template>

        </el-table-column>

        <el-table-column label="操作" width="200" fixed="right">

          <template #default="{ row }">

            <el-button

              v-if="!row.connected"

              link

              type="primary"

              :loading="actingSiteId === row.siteId"

              :disabled="!status?.platformConnected || !row.gscEnabled"

              @click="handleConnectSite(row.siteId)"

            >

              绑定

            </el-button>

            <template v-else>

              <el-button

                link

                type="primary"

                :loading="actingSiteId === row.siteId"

                @click="handleSyncSite(row.siteId)"

              >

                同步

              </el-button>

              <el-button

                link

                type="danger"

                :loading="actingSiteId === row.siteId"

                @click="handleDisconnectSite(row.siteId)"

              >

                断开

              </el-button>

            </template>

          </template>

        </el-table-column>

      </el-table>



      <el-alert

        v-for="row in sitesWithError"

        :key="row.siteId"

        class="mt-3"

        type="error"

        :closable="false"

        show-icon

        :title="`${row.domain}：${row.lastSyncError}`"

      />



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

import { useConsoleGsc } from "@/composables/useConsoleGsc";



defineOptions({ name: "ConsoleGscView" });



const {

  actingSiteId,

  autoConnecting,

  connectedFilter,

  connecting,

  disconnecting,

  formatTime,

  handleAutoConnectAll,

  handleConnect,

  handleConnectSite,

  handleDisconnectPlatform,

  handleDisconnectSite,

  handleSyncSite,

  keyword,

  limit,

  loadSites,

  loadStatus,

  loadingSites,

  loadingStatus,

  page,

  searchSites,

  sites,

  sitesWithError,

  status,

  total

} = useConsoleGsc();

</script>


