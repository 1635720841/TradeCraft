<!--
  Console 评分校准实验室入口（跨企业项目选择）。
-->
<template>
  <div class="p-4 space-y-4">
    <ConsoleProjectScopeBar />
    <el-empty v-if="!projectId" description="请先选择企业与 SEO 项目" />
    <ScoreCalibrationLabView v-else :project-id="projectId" console-mode />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { isPlatformOperatorUser } from "@/utils/platform-operator-access";
import { useConsoleProjectScope } from "@/composables/console/useConsoleProjectScope";
import ConsoleProjectScopeBar from "./components/ConsoleProjectScopeBar.vue";
import ScoreCalibrationLabView from "@/views/projects/seo-factory/ScoreCalibrationLabView.vue";

defineOptions({ name: "ConsoleScoreLabView" });

const router = useRouter();
const { projectId, syncFromRoute } = useConsoleProjectScope();

onMounted(() => {
  if (!isPlatformOperatorUser()) {
    void router.replace({ path: "/error/403" });
    return;
  }
  syncFromRoute();
});
</script>
