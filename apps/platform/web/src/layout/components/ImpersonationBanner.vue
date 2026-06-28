<!--
  平台代登录提示条：展示当前代登录目标，支持一键退出。
-->
<template>
  <el-alert
    v-if="showBanner"
    class="impersonation-banner"
    type="warning"
    :closable="false"
    show-icon
  >
    <template #title>
      <span>
        代登录中：{{ targetEmail }}
        <el-button class="ml-3" type="warning" size="small" link @click="handleExit">
          退出代登录
        </el-button>
      </span>
    </template>
  </el-alert>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  endImpersonation,
  impersonationTargetEmail,
  isImpersonating
} from "@/utils/impersonation";
import { message } from "@/utils/message";

const router = useRouter();
const active = ref(false);
const targetEmail = ref("");

onMounted(() => {
  active.value = isImpersonating();
  targetEmail.value = impersonationTargetEmail() ?? "";
});

const showBanner = computed(() => active.value && targetEmail.value);

async function handleExit() {
  try {
    await endImpersonation();
    active.value = false;
    message("已退出代登录", { type: "success" });
    await router.push("/console/tenants");
  } catch {
    message("退出失败", { type: "error" });
  }
}
</script>

<style scoped>
.impersonation-banner {
  margin: 0;
  border-radius: 0;
}
</style>
