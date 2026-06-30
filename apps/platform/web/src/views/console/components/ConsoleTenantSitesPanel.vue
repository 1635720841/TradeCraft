<!--
  租户详情：SEO 项目与站点运营摘要。
-->
<template>
  <el-card v-loading="projectsLoading || sitesLoading" shadow="never">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium">SEO 项目与站点</span>
        <router-link :to="`/console/sites?organizationId=${organizationId}`" class="text-primary text-sm">
          查看全部站点
        </router-link>
      </div>
    </template>

    <div v-if="projects.length" class="mb-4">
      <div class="mb-2 text-sm font-medium mw-text-body">SEO 项目</div>
      <el-table :data="projects" stripe size="small">
        <el-table-column prop="name" label="项目" min-width="140" />
        <el-table-column prop="siteCount" label="站点数" width="80" align="right" />
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goDiagnostics(row.id)">项目诊断</el-button>
            <el-button link type="primary" @click="goScoreLab(row.id)">评分实验室</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-empty v-else description="暂无 SEO 项目" :image-size="56" class="mb-4" />

    <div class="mb-2 text-sm font-medium mw-text-body">站点概览</div>
    <el-table v-if="sites.length" :data="sites" stripe size="small">
      <el-table-column prop="domain" label="域名" min-width="140" />
      <el-table-column prop="projectName" label="项目" min-width="120" />
      <el-table-column label="写作素材" width="96">
        <template #default="{ row }">
          <el-tag :type="row.profileReady ? 'success' : 'warning'" size="small">
            {{ row.profileReady ? "已达标" : "待完善" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Google 搜索" width="108">
        <template #default="{ row }">
          <el-tag :type="gscTagType(row.gsc.status)" size="small">
            {{ gscLabel(row.gsc.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDiagnostics(row.projectId)">诊断</el-button>
          <el-button link type="primary" @click="goGsc(row.domain)">GSC</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="暂无站点" :image-size="56" />
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { listTenantProjects, type ConsoleTenantProjectItem } from "@/api/console/projects";
import { useConsoleSiteOverview } from "@/composables/console/useConsoleSiteOverview";
import {
  getSiteGscStatusLabel,
  getSiteGscStatusTagType
} from "@/utils/seo-factory/site-gsc-display";

defineOptions({ name: "ConsoleTenantSitesPanel" });

const props = defineProps<{
  organizationId: string;
}>();

const router = useRouter();
const projectsLoading = ref(false);
const projects = ref<ConsoleTenantProjectItem[]>([]);

const {
  loading: sitesLoading,
  sites,
  loadSites
} = useConsoleSiteOverview({ organizationId: () => props.organizationId });

function gscLabel(status: Parameters<typeof getSiteGscStatusLabel>[0]) {
  return getSiteGscStatusLabel(status);
}

function gscTagType(status: Parameters<typeof getSiteGscStatusTagType>[0]) {
  return getSiteGscStatusTagType(status);
}

function scopeQuery(projectId: string) {
  return {
    organizationId: props.organizationId,
    projectId
  };
}

function goDiagnostics(projectId: string) {
  void router.push({ name: "ConsoleProjectDiagnostics", query: scopeQuery(projectId) });
}

function goScoreLab(projectId: string) {
  void router.push({ name: "ConsoleScoreLab", query: scopeQuery(projectId) });
}

function goGsc(domain: string) {
  void router.push({ path: "/console/gsc", query: { keyword: domain } });
}

async function loadProjects() {
  projectsLoading.value = true;
  try {
    projects.value = await listTenantProjects(props.organizationId);
  } finally {
    projectsLoading.value = false;
  }
}

watch(
  () => props.organizationId,
  () => {
    void loadProjects();
    void loadSites();
  }
);

onMounted(() => {
  void loadProjects();
  void loadSites();
});
</script>
