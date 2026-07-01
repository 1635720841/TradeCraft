<!--
  平台 Google Search Console OAuth 授权卡片（嵌入站点总览）。
-->
<template>
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

    <p class="mb-3 text-sm text-gray-600">
      完成一次 Google 授权后，可在下方列表为各站点绑定 Search Console 并同步搜索数据。
    </p>

    <el-alert
      v-if="status && !status.oauthConfigured"
      type="warning"
      :closable="false"
      show-icon
      title="OAuth 未配置"
      description="请先在服务器环境变量中配置 Google Search Console OAuth 凭据。"
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

    <el-collapse v-if="status && !status.oauthConfigured" class="mt-3">
      <el-collapse-item title="高级：环境变量名称" name="env">
        <p class="text-sm text-gray-600">
          在 <code>apps/platform/api/.env</code> 中配置以下变量后重启 API：
        </p>
        <ul class="mt-2 list-inside list-disc text-sm text-gray-600">
          <li><code>GOOGLE_GSC_CLIENT_ID</code></li>
          <li><code>GOOGLE_GSC_CLIENT_SECRET</code></li>
          <li><code>GOOGLE_GSC_REDIRECT_URI</code></li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </el-card>
</template>

<script setup lang="ts">
import { useConsoleGsc } from "@/composables/useConsoleGsc";

defineOptions({ name: "ConsolePlatformGscAuthCard" });

const {
  connecting,
  disconnecting,
  formatTime,
  handleConnect,
  handleDisconnectPlatform,
  loadStatus,
  loadingStatus,
  status
} = useConsoleGsc();
</script>
