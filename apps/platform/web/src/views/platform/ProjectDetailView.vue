<!--
  项目详情页：展示项目元数据，支持进入工作台与归档。

  边界：
  - 不负责：项目类型插件内部业务
-->
<template>
  <div class="p-4">
    <el-card v-loading="loading && !project" shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">项目详情</span>
          <el-button @click="goBack">返回列表</el-button>
        </div>
      </template>

      <template v-if="project">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="项目名称">
            {{ project.name }}
          </el-descriptions-item>
          <el-descriptions-item label="项目类型">
            {{ project.projectType }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="dictTagType(projectStatusDict, project.status)">
              {{ dictLabel(projectStatusDict, project.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="项目 ID">
            {{ project.id }}
          </el-descriptions-item>
          <el-descriptions-item v-if="project.createdAt" label="创建时间">
            {{ formatTime(project.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="project.updatedAt" label="更新时间">
            {{ formatTime(project.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="mt-4 flex flex-wrap gap-2">
          <el-button
            v-if="canEnter"
            type="primary"
            @click="enterProject"
          >
            进入工作台
          </el-button>
          <el-button
            v-if="canArchive"
            type="warning"
            :loading="archiving"
            @click="handleArchive"
          >
            归档项目
          </el-button>
        </div>
      </template>

      <el-empty v-else-if="!loading" description="项目不存在或无权访问" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import {
  archiveProject,
  getProject,
  type ProjectDetail
} from "@/api/platform/project";
import { projectStatusDict } from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";
import { useUserStoreHook } from "@/store/modules/user";

defineOptions({ name: "ProjectDetailView" });

const route = useRoute();
const router = useRouter();
const userStore = useUserStoreHook();

const projectId = computed(() => route.params.projectId as string);
const loading = ref(false);
const archiving = ref(false);
const project = ref<ProjectDetail | null>(null);

const isAdmin = computed(() => userStore.roles.includes("admin"));
const canEnter = computed(
  () =>
    project.value?.status === "ACTIVE" &&
    project.value?.projectType === "seo-factory"
);
const canArchive = computed(
  () => isAdmin.value && project.value?.status === "ACTIVE"
);

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function fetchProject() {
  loading.value = true;
  try {
    project.value = await getProject(projectId.value);
  } catch {
    project.value = null;
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.push({ name: "Welcome" });
}

function enterProject() {
  if (!project.value) return;
  router.push({
    name: "SeoFactoryOverview",
    params: { projectId: project.value.id }
  });
}

async function handleArchive() {
  if (!project.value) return;
  await ElMessageBox.confirm(
    `确定归档项目「${project.value.name}」？归档后无法继续创建任务。`,
    "归档确认",
    { type: "warning", confirmButtonText: "归档", cancelButtonText: "取消" }
  );
  archiving.value = true;
  try {
    project.value = await archiveProject(project.value.id);
    message("项目已归档", { type: "success" });
  } finally {
    archiving.value = false;
  }
}

onMounted(() => {
  void fetchProject();
});
</script>
