<!--
  企业订阅过期全局提示条。
-->
<template>
  <el-alert
    v-if="expired"
    class="org-subscription-banner"
    type="error"
    :closable="false"
    show-icon
    title="企业有效期已过，部分功能已受限。请联系平台管理员续期。"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getOrganizationProfile } from "@/api/org/organization";
import { useUserStoreHook } from "@/store/modules/user";

const userStore = useUserStoreHook();
const subscriptionActive = ref<boolean | null>(null);

const expired = computed(() => {
  if (!userStore.roles.length) return false;
  if (userStore.roles.includes("super_admin") || userStore.roles.includes("platform_operator")) {
    return false;
  }
  return subscriptionActive.value === false;
});

onMounted(async () => {
  try {
    const profile = await getOrganizationProfile();
    subscriptionActive.value = profile.quota.subscriptionActive !== false;
  } catch {
    subscriptionActive.value = null;
  }
});
</script>

<style scoped>
.org-subscription-banner {
  margin: 0;
  border-radius: 0;
}
</style>
