<!--
  站点列表：创建站点与跳转站点详情。

  边界：
  - 不负责：站点编辑（SiteDetailView）、项目级流程（ProjectSettingsView）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span class="font-medium">站点</span>
            <p class="mt-1 text-sm text-gray-500 font-normal">
              配置域名与 AI 写作素材，供该站下所有文章复用。
            </p>
          </div>
          <div class="flex gap-2">
            <el-checkbox v-model="mySitesOnly" @change="onOwnerFilterChange">我负责的站点</el-checkbox>
            <el-button v-if="canManageSite" type="primary" @click="openCreateDialog">新建站点</el-button>
            <el-button :loading="sitesLoading" @click="loadSites">刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="profileMissingFilter"
        class="mb-4"
        type="warning"
        :closable="false"
        show-icon
        title="仅显示写作素材未达标的站点"
      >
        <template #default>
          填写「行业」和至少一条卖点（产品线或差异化卖点）后即可创建任务。
          <el-button link type="primary" @click="clearProfileFilter">查看全部站点</el-button>
        </template>
      </el-alert>

      <AsyncErrorAlert
        :message="loadError"
        title="站点列表加载失败"
        @retry="loadSites"
      />

      <el-table v-loading="sitesLoading && !loadError" :data="displayedSites" stripe :row-class-name="siteRowClassName">
        <el-table-column prop="domain" label="域名" min-width="180" />
        <el-table-column prop="targetMarket" label="目标市场" min-width="140">
          <template #default="{ row }">
            {{ formatTargetMarketsLabel(row.targetMarkets ?? row.targetMarket) }}
          </template>
        </el-table-column>
        <el-table-column prop="contentLanguage" label="输出语言" width="100">
          <template #default="{ row }">
            {{ contentLanguageLabel(row.contentLanguage) }}
          </template>
        </el-table-column>
        <el-table-column prop="brandVoice" label="品牌语气" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.brandVoice || "-" }}
          </template>
        </el-table-column>
        <el-table-column label="Google 搜索" width="108">
          <template #default="{ row }">
            <el-tooltip :content="siteGscHint(row as SiteItem)" placement="top">
              <el-tag
                v-if="canOpenSiteGsc(row as SiteItem)"
                :type="siteGscTagType(row as SiteItem)"
                size="small"
                class="cursor-pointer"
                @click="goSiteGsc(row.id)"
              >
                {{ siteGscLabel(row as SiteItem) }}
              </el-tag>
              <span v-else class="text-xs text-gray-400">{{ siteGscLabel(row as SiteItem) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="写作素材" width="100">
          <template #default="{ row }">
            <el-tag v-if="siteItemHasMinWritingProfile(row as SiteItem)" size="small" type="success">
              已达标
            </el-tag>
            <span v-else class="text-gray-400">待完善</span>
          </template>
        </el-table-column>
        <el-table-column label="负责人" width="120">
          <template #default="{ row }">
            {{ ownerLabel(row as SiteItem) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column v-if="canManageSite" label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goSiteDetail(row as SiteItem)">管理</el-button>
            <el-button
              v-if="!siteItemHasMinWritingProfile(row as SiteItem)"
              type="warning"
              link
              @click="goSiteDetail(row as SiteItem, 'profile')"
            >
              完善素材
            </el-button>
            <el-dropdown
              trigger="click"
              @command="(cmd: string) => handleSiteRowMore(cmd, row as SiteItem)"
            >
              <el-button type="primary" link>更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="attribution">导出转化追踪表</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <span class="text-red-500">删除站点</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!sitesLoading && !loadError && displayedSites.length === 0" :description="sitesEmptyHint" />
    </el-card>

    <SiteConversionTrackingExportDialog
      v-if="attributionExportSite"
      v-model="attributionExportDialogVisible"
      :project-id="projectId"
      :site-id="attributionExportSite.id"
      :site-domain="attributionExportSite.domain"
    />

    <el-dialog v-model="siteDialogVisible" title="新建站点" width="640px" destroy-on-close>
      <el-form ref="siteFormRef" :model="siteForm" :rules="siteRules" label-width="100px">
        <el-form-item label="域名" prop="domain">
          <el-input v-model="siteForm.domain" placeholder="例如 example.com" />
        </el-form-item>
        <el-form-item label="目标市场">
          <el-select
            v-model="siteForm.targetMarkets"
            class="w-full"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            allow-create
            default-first-option
            placeholder="可选择多个国家/地区"
          >
            <el-option
              v-for="item in targetMarketOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <p class="mt-1 text-xs text-gray-500">独立站可面向多个市场，AI 写作时会一并考虑。</p>
        </el-form-item>
        <el-form-item label="输出语言" prop="contentLanguage">
          <el-select v-model="siteForm.contentLanguage" class="w-full">
            <el-option
              v-for="item in contentLanguageOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="siteForm.ownerUserId"
            clearable
            filterable
            class="w-full"
            placeholder="可选"
          >
            <el-option
              v-for="member in projectMembers"
              :key="member.userId"
              :label="`${member.email}${member.name ? ` (${member.name})` : ''}`"
              :value="member.userId"
            />
          </el-select>
        </el-form-item>
        <p class="text-xs text-gray-500">保存后进入站点详情完善写作素材，达标后即可创建任务。</p>
      </el-form>
      <template #footer>
        <el-button @click="siteDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="siteSaving" @click="submitSiteForm">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { createSite, deleteSite, listSites, updateSite } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { listProjectMembers, type OrgProjectMember } from "@/api/org/projects";
import {
  CONTENT_LANGUAGE_OPTIONS,
  TARGET_MARKET_OPTIONS,
  type ContentLanguageCode
} from "@/constants/dicts/seo-factory";
import { dictLabel } from "@/utils/dict";
import { message } from "@/utils/message";
import { confirmDestructiveDelete } from "@/utils/confirm-destructive-delete";
import { siteItemHasMinWritingProfile } from "@/utils/seo-factory/site-writing-profile";
import { formatTargetMarketsLabel } from "@/utils/seo-factory/target-market";
import {
  canOpenSiteGscView,
  getSiteGscStatusHint,
  getSiteGscStatusLabel,
  getSiteGscStatusTagType
} from "@/utils/seo-factory/site-gsc-display";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";
import SiteConversionTrackingExportDialog from "./components/SiteConversionTrackingExportDialog.vue";
import AsyncErrorAlert from "@/components/feedback/AsyncErrorAlert.vue";
import { runLoad } from "@/composables/run-load";

defineOptions({ name: "SiteManageView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const canManageSite = computed(() => can("seo:site:manage"));

const sitesLoading = ref(false);
const loadError = ref<string | null>(null);
const siteSaving = ref(false);
const attributionExportDialogVisible = ref(false);
const attributionExportSite = ref<SiteItem | null>(null);
const mySitesOnly = ref(false);
const sites = ref<SiteItem[]>([]);
const projectMembers = ref<OrgProjectMember[]>([]);
const siteDialogVisible = ref(false);
const siteFormRef = ref<FormInstance>();

const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;
const targetMarketOptions = TARGET_MARKET_OPTIONS;

const siteForm = reactive({
  domain: "",
  targetMarkets: [] as string[],
  contentLanguage: "en" as ContentLanguageCode,
  ownerUserId: "" as string
});

const siteRules: FormRules = {
  domain: [
    { required: true, message: "请输入域名", trigger: "blur" },
    { min: 3, message: "域名至少 3 个字符", trigger: "blur" }
  ],
  contentLanguage: [{ required: true, message: "请选择语言", trigger: "change" }]
};

const profileMissingFilter = computed(
  () => route.query.profile === "missing" || route.query.profile === "1"
);

const displayedSites = computed(() => {
  if (!profileMissingFilter.value) return sites.value;
  return sites.value.filter((site) => !siteItemHasMinWritingProfile(site));
});

function siteGscLabel(site: SiteItem) {
  return getSiteGscStatusLabel(site.gsc?.status ?? "not_enabled");
}

function siteGscTagType(site: SiteItem) {
  return getSiteGscStatusTagType(site.gsc?.status ?? "not_enabled");
}

function siteGscHint(site: SiteItem) {
  return getSiteGscStatusHint(site.gsc);
}

function canOpenSiteGsc(site: SiteItem) {
  return canOpenSiteGscView(site.gsc);
}

function goSiteGsc(siteId: string) {
  router.push({
    name: "SeoFactorySiteDetail",
    params: { projectId, siteId },
    query: { tab: "search" }
  });
}

function goSiteDetail(site: SiteItem, tab: "basic" | "profile" = "basic") {
  router.push({
    name: "SeoFactorySiteDetail",
    params: { projectId, siteId: site.id },
    query: tab === "basic" ? undefined : { tab }
  });
}

const sitesEmptyHint = computed(() =>
  profileMissingFilter.value ? "所有站点均已达标" : "暂无站点，请先新建站点"
);

function contentLanguageLabel(code?: string | null) {
  return dictLabel(contentLanguageOptions, code, "-");
}

function ownerLabel(site: SiteItem): string {
  if (!site.ownerUserId) return "-";
  const member = projectMembers.value.find((item) => item.userId === site.ownerUserId);
  return member?.name || member?.email || site.ownerUserId.slice(0, 8);
}

function onOwnerFilterChange() {
  void loadSites();
}

function openAttributionExportDialog(site: SiteItem) {
  attributionExportSite.value = site;
  attributionExportDialogVisible.value = true;
}

function resetSiteForm() {
  siteForm.domain = "";
  siteForm.targetMarkets = [];
  siteForm.contentLanguage = "en";
  siteForm.ownerUserId = "";
}

function siteRowClassName({ row }: { row: SiteItem }) {
  return !siteItemHasMinWritingProfile(row) ? "site-row--profile-missing" : "";
}

function clearProfileFilter() {
  router.replace({ name: "SeoFactorySites", params: { projectId } });
}

function handleSiteRowMore(command: string, site: SiteItem) {
  if (command === "attribution") {
    openAttributionExportDialog(site);
  } else if (command === "delete") {
    void confirmDeleteSite(site);
  }
}

async function confirmDeleteSite(site: SiteItem) {
  if (!canManageSite.value) return;

  await confirmDestructiveDelete({
    description: `确定删除站点「${site.domain}」？此操作不可恢复，该站点下的页面库、GSC 连接与文章任务将全部删除。`,
    expectedText: site.domain
  });

  try {
    await deleteSite(projectId, site.id);
    message("站点已删除", { type: "success" });
    await loadSites();
  } catch (error) {
    message(error instanceof Error ? error.message : "删除失败", { type: "error" });
  }
}

function openCreateDialog() {
  resetSiteForm();
  siteDialogVisible.value = true;
}

function buildSitePayload() {
  return {
    domain: siteForm.domain.trim(),
    targetMarkets: siteForm.targetMarkets.length ? siteForm.targetMarkets : undefined,
    contentLanguage: siteForm.contentLanguage
  } as Parameters<typeof createSite>[1];
}

async function submitSiteForm() {
  if (!siteFormRef.value) return;
  await siteFormRef.value.validate(async (valid) => {
    if (!valid) return;
    siteSaving.value = true;
    try {
      const created = await createSite(projectId, buildSitePayload());
      if (siteForm.ownerUserId.trim()) {
        await updateSite(projectId, created.id, {
          ownerUserId: siteForm.ownerUserId.trim()
        });
      }
      message("站点已创建，请完善写作素材后再创建任务", { type: "success" });
      siteDialogVisible.value = false;
      await loadSites();
      goSiteDetail(created, "profile");
    } finally {
      siteSaving.value = false;
    }
  });
}

async function loadSites() {
  await runLoad(
    () => listSites(projectId, mySitesOnly.value ? { siteOwner: "me" } : undefined),
    {
      setLoading: (value) => {
        sitesLoading.value = value;
      },
      setError: (value) => {
        loadError.value = value;
      },
      onSuccess: (result) => {
        sites.value = result;
      },
      fallbackMessage: "加载站点失败"
    }
  );
}

async function loadProjectMembers() {
  try {
    projectMembers.value = await listProjectMembers(projectId);
  } catch {
    projectMembers.value = [];
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

onMounted(() => {
  void loadProjectMembers();
  void loadSites();
});
</script>

<style scoped>
.site-row--profile-missing {
  --el-table-tr-bg-color: var(--el-color-warning-light-9);
}
</style>
