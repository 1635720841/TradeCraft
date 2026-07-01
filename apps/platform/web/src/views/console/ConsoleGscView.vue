<!--
  旧 /console/gsc 路径：OAuth 回调兼容重定向到站点总览。
-->
<template>
  <div class="flex min-h-[200px] items-center justify-center p-4 text-sm text-gray-500">
    正在跳转到站点总览…
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

defineOptions({ name: "ConsoleGscView" });

const route = useRoute();
const router = useRouter();

onMounted(() => {
  void router.replace({
    path: "/console/sites",
    query: route.query
  });
});
</script>
