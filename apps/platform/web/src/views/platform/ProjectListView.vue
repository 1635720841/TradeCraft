<!--
  项目列表页：展示企业下所有项目。

  边界：
  - 不负责：项目内部业务（由 project-type 插件页面处理）
-->
<template>
  <div class="p-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">项目列表</span>
          <div class="flex gap-2">
            <el-button type="primary" @click="openCreateDialog">新建项目</el-button>
            <el-button type="primary" link @click="fetchProjects">刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="seo-factory 类型项目可点击「进入」打开任务工作台；「详情」可查看元数据并归档。"
      />

      <el-table v-loading="loading" :data="projects" stripe style="width: 100%">
        <el-table-column prop="name" label="项目名称" min-width="180" />
        <el-table-column prop="projectType" label="项目类型" min-width="140" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="dictTagType(projectStatusDict, row.status)">
              {{ dictLabel(projectStatusDict, row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170">
          <template #default="{ row }">
            {{ row.createdAt ? formatTime(row.createdAt) : "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="id" label="ID" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.projectType === 'seo-factory' && row.status === 'ACTIVE'"
              type="primary"
              link
              @click="enterProject(row as ProjectItem)"
            >
              进入
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="fetchProjects"
          @size-change="onSizeChange"
        />
      </div>

      <el-empty v-if="!loading && projects.length === 0" description="暂无项目" />
    </el-card>

    <el-dialog v-model="createVisible" title="新建项目" width="420px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="88px">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="createForm.name" placeholder="例如：北美 SEO 内容工厂" />
        </el-form-item>
        <el-form-item label="项目类型" prop="projectType">
          <el-select v-model="createForm.projectType" class="w-full">
            <el-option label="SEO 内容工厂" value="seo-factory" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import {
  createProject,
  listProjects,
  type ProjectItem
} from "@/api/platform/project";
import { projectStatusDict } from "@/constants/dicts/platform";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "ProjectListView" });

const router = useRouter();
const loading = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const projects = ref<ProjectItem[]>([]);
const page = ref(1);
const limit = ref(20);
const total = ref(0);

const createForm = reactive({
  name: "",
  projectType: "seo-factory" as const
});

const createRules: FormRules = {
  name: [{ required: true, message: "请输入项目名称", trigger: "blur" }],
  projectType: [{ required: true, message: "请选择项目类型", trigger: "change" }]
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

async function fetchProjects() {
  loading.value = true;
  try {
    const result = await listProjects(page.value, limit.value);
    projects.value = result.items;
    total.value = result.pagination.total;
    page.value = result.pagination.page;
    limit.value = result.pagination.limit;
  } finally {
    loading.value = false;
  }
}

function onSizeChange() {
  page.value = 1;
  void fetchProjects();
}

function openCreateDialog() {
  createForm.name = "";
  createForm.projectType = "seo-factory";
  createVisible.value = true;
}

async function submitCreate() {
  const form = createFormRef.value;
  if (!form) return;
  await form.validate(async valid => {
    if (!valid) return;
    creating.value = true;
    try {
      const project = await createProject({
        name: createForm.name.trim(),
        projectType: createForm.projectType
      });
      message("项目创建成功", { type: "success" });
      createVisible.value = false;
      await fetchProjects();
      if (project.projectType === "seo-factory") {
        enterProject(project);
      }
    } finally {
      creating.value = false;
    }
  });
}

function goDetail(id: string) {
  router.push({ name: "PlatformProjectDetail", params: { projectId: id } });
}

function enterProject(row: ProjectItem) {
  router.push({ name: "SeoFactoryJobs", params: { projectId: row.id } });
}

onMounted(() => {
  void fetchProjects();
});
</script>
