<!--
  项目配置：企业运营向流程开关（按站点）。

  边界：
  - 不负责：评分门槛、校准与 SERP 高级参数（Console 项目诊断）
  - 不负责：站点素材、CMS、页面库（SiteDetailView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="项目配置说明"
      description="此处配置大纲确认、原创润色与自动配图等运营开关。"
    />

    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">流程开关</span>
          <div class="flex flex-wrap gap-2">
            <el-select
              v-model="selectedSiteId"
              placeholder="选择站点"
              style="width: 220px"
              :loading="sitesLoading"
              @change="onSiteChange"
            >
              <el-option
                v-for="site in sites"
                :key="site.id"
                :label="site.domain"
                :value="site.id"
              />
            </el-select>
            <el-button
              v-if="canManageSite"
              type="primary"
              :loading="saving"
              :disabled="!selectedSiteId"
              @click="submitAdminForm"
            >
              保存配置
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!sitesLoading && sites.length === 0" description="请先在「站点」创建站点" />

      <el-alert
        v-else-if="!canManageSite"
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="您仅有查看权限，无法修改项目配置"
      />

      <el-form v-else :model="adminForm" label-width="120px" :disabled="!canManageSite">
        <el-form-item label="大纲需确认">
          <el-switch v-model="adminForm.requireBriefApproval" />
          <p class="mt-1 text-xs text-gray-500">
            开启后，大纲生成完成需人工确认再进入初稿，适合 B2B 方向把控。
          </p>
        </el-form-item>

        <el-form-item label="原创表达优化">
          <el-switch v-model="adminForm.enableParaphrase" />
          <p class="mt-1 text-xs text-gray-500">
            Semrush 优化后自动去 AI 套话、轻量润色。术语敏感站点可关闭。
          </p>
        </el-form-item>

        <el-form-item label="自动配图">
          <el-switch v-model="adminForm.enableIllustration" />
          <p class="mt-1 text-xs text-gray-500">
            内链完成后通过 BFL 自动生成文章配图。关闭后正文不含插图，可节省配图配额。
          </p>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listSites, updateSite } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { message } from "@/utils/message";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";

defineOptions({ name: "ProjectSettingsView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const canManageSite = computed(() => can("seo:site:manage"));

const sitesLoading = ref(false);
const saving = ref(false);
const sites = ref<SiteItem[]>([]);
const selectedSiteId = ref("");

const adminForm = reactive({
  requireBriefApproval: false,
  enableParaphrase: true,
  enableIllustration: true
});

const selectedSite = computed(
  () => sites.value.find((site) => site.id === selectedSiteId.value) ?? null
);

function resetAdminForm() {
  adminForm.requireBriefApproval = false;
  adminForm.enableParaphrase = true;
  adminForm.enableIllustration = true;
}

function loadAdminFormFromSite(site: SiteItem) {
  resetAdminForm();
  adminForm.requireBriefApproval = site.workflow?.requireBriefApproval ?? false;
  adminForm.enableParaphrase = site.workflow?.enableParaphrase !== false;
  adminForm.enableIllustration = site.workflow?.enableIllustration !== false;
}

function syncSelectedSiteFromRoute() {
  const querySiteId = route.query.siteId;
  if (typeof querySiteId === "string" && sites.value.some((site) => site.id === querySiteId)) {
    selectedSiteId.value = querySiteId;
    return;
  }
  if (!selectedSiteId.value && sites.value.length > 0) {
    selectedSiteId.value = sites.value[0].id;
  }
}

function onSiteChange() {
  const site = selectedSite.value;
  if (site) loadAdminFormFromSite(site);
  router.replace({
    name: "SeoFactorySettings",
    params: { projectId },
    query: selectedSiteId.value ? { siteId: selectedSiteId.value } : undefined
  });
}

function buildAdminPayload() {
  return {
    workflow: {
      requireBriefApproval: adminForm.requireBriefApproval,
      enableParaphrase: adminForm.enableParaphrase,
      enableIllustration: adminForm.enableIllustration
    }
  } satisfies Parameters<typeof updateSite>[2];
}

async function submitAdminForm() {
  if (!selectedSiteId.value) return;

  saving.value = true;
  try {
    await updateSite(projectId, selectedSiteId.value, buildAdminPayload());
    message("项目配置已保存", { type: "success" });
    await loadSites();
  } finally {
    saving.value = false;
  }
}

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
    syncSelectedSiteFromRoute();
    const site = selectedSite.value;
    if (site) loadAdminFormFromSite(site);
  } finally {
    sitesLoading.value = false;
  }
}

watch(
  () => route.query.siteId,
  () => {
    syncSelectedSiteFromRoute();
    const site = selectedSite.value;
    if (site) loadAdminFormFromSite(site);
  }
);

onMounted(() => {
  void loadSites();
});
</script>
