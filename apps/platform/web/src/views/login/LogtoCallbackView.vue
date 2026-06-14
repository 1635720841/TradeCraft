<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { message } from "@/utils/message";
import { initRouter, getTopMenu } from "@/router/utils";
import { useUserStoreHook } from "@/store/modules/user";
import { logtoCallback } from "@/api/user";

defineOptions({
  name: "LogtoCallback"
});

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const errorText = ref("");

onMounted(async () => {
  const code = typeof route.query.code === "string" ? route.query.code : "";
  const redirectUri = `${window.location.origin}${window.location.pathname}${window.location.hash.split("?")[0]}`;

  if (!code) {
    errorText.value = "缺少授权码，请从登录页重新发起 Logto 登录";
    loading.value = false;
    return;
  }

  try {
    const res = await logtoCallback({ code, redirectUri });
    if (!res?.success) {
      errorText.value = "Logto 登录失败";
      return;
    }
    await useUserStoreHook().applySession(res.data);
    await initRouter();
    await router.replace(getTopMenu(true).path);
    message("Logto 登录成功", { type: "success" });
  } catch {
    errorText.value = "Logto 登录失败，请重试";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="flex items-center justify-center min-h-screen">
    <el-card class="w-[420px]">
      <template #header>Logto 登录</template>
      <p v-if="loading">正在完成登录…</p>
      <p v-else-if="errorText" class="text-red-500">{{ errorText }}</p>
      <el-button v-if="!loading && errorText" type="primary" @click="router.replace('/login')">
        返回登录页
      </el-button>
    </el-card>
  </div>
</template>
