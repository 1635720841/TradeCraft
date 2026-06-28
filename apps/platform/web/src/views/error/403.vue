<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import noAccess from "@/assets/status/403.svg?component";
import { createProjectAccessRequest } from "@/api/org/access";
import { message } from "@/utils/message";

defineOptions({ name: "403" });

const route = useRoute();
const router = useRouter();
const applying = ref(false);
const projectId = ref(typeof route.query.projectId === "string" ? route.query.projectId : "");

async function applyAccess() {
  if (!projectId.value) {
    message("请联系企业管理员申请项目权限", { type: "info" });
    return;
  }
  applying.value = true;
  try {
    await createProjectAccessRequest(projectId.value);
    message("访问申请已提交，请等待管理员审批", { type: "success" });
  } catch {
    message("提交失败，请稍后重试", { type: "error" });
  } finally {
    applying.value = false;
  }
}

onMounted(() => {
  projectId.value =
    typeof route.query.projectId === "string" ? route.query.projectId : "";
});
</script>

<template>
  <div class="flex flex-col md:flex-row justify-center items-center min-h-full w-full p-4 md:p-0">
    <noAccess />
    <div class="mt-8 md:ml-12 md:mt-0 text-center md:text-left">
      <p class="font-medium text-4xl mb-4! dark:text-white">403</p>
      <p class="text-xl mb-4! text-gray-500">抱歉，你无权访问该页面</p>
      <p v-if="projectId" class="mb-4 text-sm text-gray-400">
        您可以向企业管理员申请加入该项目
      </p>
      <div class="flex flex-wrap gap-2 justify-center md:justify-start">
        <el-button type="primary" @click="router.push('/')">返回首页</el-button>
        <el-button v-if="projectId" :loading="applying" @click="applyAccess">
          申请访问
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-content {
  margin: 0 !important;
}
</style>
