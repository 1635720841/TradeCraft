<!--
  邀请接受页：校验 token 后跳转 Logto 登录。
-->
<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 p-4">
    <el-card v-loading="loading" class="w-full max-w-md" shadow="never">
      <template #header>
        <span class="font-medium">接受企业邀请</span>
      </template>
      <div v-if="inviteInfo">
        <p class="mb-2 text-sm text-gray-600">
          您已被邀请加入 <strong>{{ inviteInfo.organizationName }}</strong>
        </p>
        <p class="mb-4 text-sm">邮箱：{{ inviteInfo.email }}</p>
        <el-button type="primary" class="w-full" @click="goLogin">
          登录并接受邀请
        </el-button>
      </div>
      <el-result v-else-if="error" icon="error" :title="error" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { http } from "@/utils/http";

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref("");
const inviteInfo = ref<{
  email: string;
  organizationName: string;
} | null>(null);
const token = ref("");

onMounted(async () => {
  token.value = String(route.query.token ?? "");
  if (!token.value) {
    error.value = "邀请链接无效";
    loading.value = false;
    return;
  }
  try {
    const res = await http.request<{ data: typeof inviteInfo.value }>(
      "get",
      "/api/v1/auth/invite/validate",
      { params: { token: token.value } }
    );
    inviteInfo.value = res.data;
  } catch {
    error.value = "邀请链接无效或已过期";
  } finally {
    loading.value = false;
  }
});

function goLogin() {
  sessionStorage.setItem("wm:invite-token", token.value);
  router.push({ path: "/login", query: { invite: "1" } });
}
</script>
