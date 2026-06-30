/**
 * Console GSC 平台授权与站点绑定逻辑。
 */

import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessageBox } from "element-plus";
import {
  autoConnectAllConsoleGscSites,
  connectConsoleGscSite,
  disconnectConsoleGsc,
  disconnectConsoleGscSite,
  getConsoleGscConnectUrl,
  getConsoleGscStatus,
  listConsoleGscSites,
  syncConsoleGscSite,
  type ConsoleGscSiteRow,
  type PlatformGscStatus
} from "@/api/console/gsc";
import { message } from "@/utils/message";

export function useConsoleGsc() {
  const route = useRoute();

  const loadingStatus = ref(false);
  const loadingSites = ref(false);
  const connecting = ref(false);
  const disconnecting = ref(false);
  const autoConnecting = ref(false);
  const actingSiteId = ref<string | null>(null);

  const status = ref<PlatformGscStatus | null>(null);
  const sites = ref<ConsoleGscSiteRow[]>([]);
  const keyword = ref("");
  const connectedFilter = ref<"" | "true" | "false">("");
  const page = ref(1);
  const limit = ref(20);
  const total = ref(0);

  const sitesWithError = computed(() => sites.value.filter(row => row.lastSyncError));

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString("zh-CN");
  }

  async function loadStatus() {
    loadingStatus.value = true;
    try {
      status.value = await getConsoleGscStatus();
    } catch (error) {
      message(error instanceof Error ? error.message : "加载授权状态失败", { type: "error" });
    } finally {
      loadingStatus.value = false;
    }
  }

  async function loadSites() {
    loadingSites.value = true;
    try {
      const result = await listConsoleGscSites({
        page: page.value,
        limit: limit.value,
        keyword: keyword.value.trim() || undefined,
        connected: connectedFilter.value || undefined
      });
      sites.value = result.items;
      total.value = result.total;
    } catch (error) {
      message(error instanceof Error ? error.message : "加载站点列表失败", { type: "error" });
    } finally {
      loadingSites.value = false;
    }
  }

  function searchSites() {
    page.value = 1;
    void loadSites();
  }

  async function handleConnect() {
    connecting.value = true;
    try {
      const { authUrl } = await getConsoleGscConnectUrl();
      window.location.href = authUrl;
    } catch (error) {
      message(error instanceof Error ? error.message : "无法发起 Google 授权", { type: "error" });
    } finally {
      connecting.value = false;
    }
  }

  async function handleDisconnectPlatform() {
    await ElMessageBox.confirm(
      "断开后所有站点将无法继续同步搜索数据，需重新授权。",
      "确认断开平台授权",
      { type: "warning" }
    );
    disconnecting.value = true;
    try {
      await disconnectConsoleGsc();
      message("已断开平台 Google 授权", { type: "success" });
      await loadStatus();
      await loadSites();
    } finally {
      disconnecting.value = false;
    }
  }

  async function handleAutoConnectAll() {
    autoConnecting.value = true;
    try {
      const result = await autoConnectAllConsoleGscSites();
      message(
        `批量绑定完成：成功 ${result.connected}，失败 ${result.failed}，跳过 ${result.skipped}`,
        { type: result.failed > 0 ? "warning" : "success" }
      );
      await loadSites();
    } finally {
      autoConnecting.value = false;
    }
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

  async function handleDisconnectSite(siteId: string) {
    await ElMessageBox.confirm("断开后该站点搜索数据将不再更新。", "确认断开站点", {
      type: "warning"
    });
    actingSiteId.value = siteId;
    try {
      await disconnectConsoleGscSite(siteId);
      message("已断开站点绑定", { type: "success" });
      await loadSites();
    } finally {
      actingSiteId.value = null;
    }
  }

  onMounted(async () => {
    if (route.query.gsc === "connected") {
      message("Google 授权成功，正在自动绑定站点…", { type: "success" });
    } else if (route.query.gsc === "error") {
      message("Google 授权失败或已取消，请重试", { type: "error" });
    }
    const queryKeyword = route.query.keyword;
    if (typeof queryKeyword === "string" && queryKeyword.trim()) {
      keyword.value = queryKeyword.trim();
    }
    await loadStatus();
    await loadSites();
  });

  return {
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
  };
}
