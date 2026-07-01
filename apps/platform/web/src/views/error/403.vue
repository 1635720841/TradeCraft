<!--
  403 无权访问：按 reason 展示差异化文案与 CTA。
-->
<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import noAccess from "@/assets/status/403.svg?component";
import { createProjectAccessRequest } from "@/api/org/access";
import { message } from "@/utils/message";

defineOptions({ name: "403" });

type ForbiddenReason =
  | "project_access"
  | "seo_permission"
  | "org_permission"
  | "console_denied"
  | "role_denied"
  | "default";

const REASON_COPY: Record<
  ForbiddenReason,
  { title: string; description: string; primaryLabel: string; primaryPath: string }
> = {
  project_access: {
    title: "无法进入该项目",
    description: "您尚未加入该项目或访问期已过期，可向企业管理员申请访问。",
    primaryLabel: "返回首页",
    primaryPath: "/"
  },
  seo_permission: {
    title: "项目权限不足",
    description: "您的项目岗位权限无法访问此功能，请联系企业管理员调整项目权限。",
    primaryLabel: "返回项目概览",
    primaryPath: "/"
  },
  org_permission: {
    title: "企业功能未开通",
    description: "您的账号没有此企业管理功能的权限，请联系企业管理员。",
    primaryLabel: "返回企业管理",
    primaryPath: "/org/profile"
  },
  console_denied: {
    title: "无法访问平台管理",
    description: "此功能仅平台运营账号可用。",
    primaryLabel: "返回首页",
    primaryPath: "/"
  },
  role_denied: {
    title: "角色无权访问",
    description: "当前账号角色无法访问此页面。",
    primaryLabel: "返回首页",
    primaryPath: "/"
  },
  default: {
    title: "无权访问",
    description: "抱歉，您无权访问该页面。",
    primaryLabel: "返回首页",
    primaryPath: "/"
  }
};

const route = useRoute();
const router = useRouter();
const applying = ref(false);
const projectId = ref("");
const reason = ref<ForbiddenReason>("default");

const copy = computed(() => REASON_COPY[reason.value] ?? REASON_COPY.default);

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
    // global HTTP interceptor shows API errors
  } finally {
    applying.value = false;
  }
}

function goPrimary() {
  void router.push(copy.value.primaryPath);
}

onMounted(() => {
  projectId.value =
    typeof route.query.projectId === "string" ? route.query.projectId : "";
  const rawReason = typeof route.query.reason === "string" ? route.query.reason : "";
  if (rawReason in REASON_COPY) {
    reason.value = rawReason as ForbiddenReason;
  }
});
</script>

<template>
  <div class="flex flex-col md:flex-row justify-center items-center min-h-full w-full p-4 md:p-0">
    <noAccess />
    <div class="mt-8 md:ml-12 md:mt-0 text-center md:text-left">
      <p class="font-medium text-4xl mb-4! dark:text-white">403</p>
      <p class="text-xl mb-2! text-gray-700 dark:text-gray-200">{{ copy.title }}</p>
      <p class="text-base mb-4! text-gray-500">{{ copy.description }}</p>
      <div class="flex flex-wrap gap-2 justify-center md:justify-start">
        <el-button type="primary" @click="goPrimary">{{ copy.primaryLabel }}</el-button>
        <el-button
          v-if="reason === 'project_access' && projectId"
          :loading="applying"
          @click="applyAccess"
        >
          申请访问
        </el-button>
        <el-button
          v-if="reason === 'seo_permission' || reason === 'project_access'"
          @click="router.push('/org/projects')"
        >
          前往项目管理
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
