/**
 * Console GSC 平台 OAuth 授权逻辑。
 */

import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import {
  disconnectConsoleGsc,
  getConsoleGscConnectUrl,
  getConsoleGscStatus,
  type PlatformGscStatus
} from "@/api/console/gsc";
import { message } from "@/utils/message";

export function useConsoleGsc() {
  const route = useRoute();
  const router = useRouter();

  const loadingStatus = ref(false);
  const connecting = ref(false);
  const disconnecting = ref(false);
  const status = ref<PlatformGscStatus | null>(null);

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
    } finally {
      disconnecting.value = false;
    }
  }

  function clearOAuthQuery() {
    if (route.query.gsc === undefined) return;
    const { gsc: _gsc, ...rest } = route.query;
    void router.replace({ path: route.path, query: rest });
  }

  onMounted(async () => {
    if (route.query.gsc === "connected") {
      message("Google 授权成功", { type: "success" });
      clearOAuthQuery();
    } else if (route.query.gsc === "error") {
      message("Google 授权失败或已取消，请重试", { type: "error" });
      clearOAuthQuery();
    }
    await loadStatus();
  });

  return {
    connecting,
    disconnecting,
    formatTime,
    handleConnect,
    handleDisconnectPlatform,
    loadStatus,
    loadingStatus,
    status
  };
}
