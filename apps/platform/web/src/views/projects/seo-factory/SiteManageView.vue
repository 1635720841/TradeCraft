<!--
  站点与页面库管理：站点 CRUD、sitemap 同步供内链匹配。

  边界：
  - 不负责：内链植入（后端 LinkingService）
-->
<template>
  <div class="p-4 space-y-4">
    <el-card shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">站点配置</span>
          <div class="flex gap-2">
            <el-button type="primary" @click="openCreateDialog">新建站点</el-button>
            <el-button :loading="sitesLoading" @click="loadSites">刷新</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="sitesLoading" :data="sites" stripe>
        <el-table-column prop="domain" label="域名" min-width="180" />
        <el-table-column prop="targetMarket" label="目标市场" width="100">
          <template #default="{ row }">
            {{ row.targetMarket || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="contentLanguage" label="语言" width="100">
          <template #default="{ row }">
            {{ row.contentLanguage || "-" }}
          </template>
        </el-table-column>
        <el-table-column
          v-if="wordpressCmsUiEnabled"
          prop="cmsType"
          label="CMS"
          width="110"
        >
          <template #default="{ row }">
            <el-tag v-if="row.cmsType === 'wordpress'" size="small" type="success">WordPress</el-tag>
            <span v-else class="text-gray-400">未配置</span>
          </template>
        </el-table-column>
        <el-table-column prop="brandVoice" label="品牌语气" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.brandVoice || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEditDialog(row as SiteItem)">编辑</el-button>
            <el-button type="primary" link @click="selectSite(row.id)">页面库</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!sitesLoading && sites.length === 0" description="暂无站点，请先新建站点" />
    </el-card>

    <el-card v-if="selectedSite" shadow="never">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">页面库 · {{ selectedSite.domain }}</span>
          <div class="flex gap-2">
            <el-button :loading="pagesLoading" @click="loadPages">刷新</el-button>
            <el-button type="primary" :loading="syncing" @click="handleSync">
              从 Sitemap 同步
            </el-button>
          </div>
        </div>
      </template>

      <el-alert
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="内链候选页"
        description="同步后供 M8 内链模块自动匹配；任务运行中若库为空会自动触发一次同步。"
      />

      <el-table v-loading="pagesLoading" :data="pages" stripe>
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="url" label="URL" min-width="260">
          <template #default="{ row }">
            <el-link :href="row.url" target="_blank" type="primary">
              {{ row.url }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="pageType" label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="dictTagType(sitePageTypeDict, row.pageType)">
              {{ dictLabel(sitePageTypeDict, row.pageType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="businessValue" label="业务权重" width="100">
          <template #default="{ row }">
            {{ formatWeight(row.businessValue) }}
          </template>
        </el-table-column>
        <el-table-column prop="keywords" label="关键词" min-width="160">
          <template #default="{ row }">
            {{ (row.keywords ?? []).slice(0, 3).join("、") || "-" }}
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="90" />
        <el-table-column prop="updatedAt" label="更新时间" min-width="170">
          <template #default="{ row }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!pagesLoading && pages.length === 0" description="页面库为空，请点击「从 Sitemap 同步」" />
    </el-card>

    <el-dialog
      v-model="siteDialogVisible"
      :title="editingSiteId ? '编辑站点' : '新建站点'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="siteFormRef" :model="siteForm" :rules="siteRules" label-width="120px">
        <el-form-item label="域名" prop="domain">
          <el-input v-model="siteForm.domain" placeholder="例如 example.com" />
        </el-form-item>
        <el-form-item label="目标市场" prop="targetMarket">
          <el-input v-model="siteForm.targetMarket" placeholder="例如 US、CN" />
        </el-form-item>
        <el-form-item label="内容语言" prop="contentLanguage">
          <el-select v-model="siteForm.contentLanguage" class="w-full">
            <el-option
              v-for="item in contentLanguageOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="品牌语气" prop="brandVoice">
          <el-input
            v-model="siteForm.brandVoice"
            type="textarea"
            :rows="4"
            maxlength="2000"
            show-word-limit
            placeholder="描述品牌调性，供 Brief 与初稿 Prompt 使用"
          />
        </el-form-item>

        <template v-if="wordpressCmsUiEnabled">
        <el-divider content-position="left">WordPress 发布（可选）</el-divider>
        <el-form-item label="启用 WordPress">
          <el-switch v-model="siteForm.enableWordPress" />
        </el-form-item>
        <template v-if="siteForm.enableWordPress">
          <el-form-item label="站点 URL" prop="wpBaseUrl">
            <el-input v-model="siteForm.wpBaseUrl" placeholder="https://example.com" />
          </el-form-item>
          <el-form-item label="用户名" prop="wpUsername">
            <el-input v-model="siteForm.wpUsername" placeholder="WordPress 用户名" />
          </el-form-item>
          <el-form-item label="应用密码" prop="wpAppPassword">
            <el-input
              v-model="siteForm.wpAppPassword"
              type="password"
              show-password
              :placeholder="editingSiteId && siteForm.wpPasswordConfigured ? '留空则保留原密码' : 'WordPress Application Password'"
            />
          </el-form-item>
          <el-form-item label="默认状态">
            <el-select v-model="siteForm.wpDefaultStatus" class="w-full">
              <el-option label="草稿（推荐）" value="draft" />
              <el-option label="直接发布" value="publish" />
            </el-select>
          </el-form-item>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="说明"
            description="需在 WordPress 启用 REST API 并创建 Application Password。任务完成后可在详情页一键推送。"
          />
        </template>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="siteDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="siteSaving" @click="submitSiteForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { createSite, listSitePages, listSites, syncSitePages, updateSite } from "@/api/seo-factory/site";
import type { SiteItem, SitePageItem } from "@/api/seo-factory/types";
import {
  CONTENT_LANGUAGE_OPTIONS,
  type ContentLanguageCode,
  sitePageTypeDict
} from "@/constants/dicts/seo-factory";
import { dictLabel, dictTagType } from "@/utils/dict";
import { WORDPRESS_CMS_UI_ENABLED } from "@/constants/feature-flags";
import { message } from "@/utils/message";

defineOptions({ name: "SiteManageView" });

const wordpressCmsUiEnabled = WORDPRESS_CMS_UI_ENABLED;

const route = useRoute();
const projectId = route.params.projectId as string;

const sitesLoading = ref(false);
const pagesLoading = ref(false);
const syncing = ref(false);
const siteSaving = ref(false);
const sites = ref<SiteItem[]>([]);
const pages = ref<SitePageItem[]>([]);
const selectedSiteId = ref("");
const siteDialogVisible = ref(false);
const editingSiteId = ref("");
const siteFormRef = ref<FormInstance>();

const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;

const siteForm = reactive({
  domain: "",
  targetMarket: "",
  contentLanguage: "en" as ContentLanguageCode,
  brandVoice: "",
  enableWordPress: false,
  wpBaseUrl: "",
  wpUsername: "",
  wpAppPassword: "",
  wpPasswordConfigured: false,
  wpDefaultStatus: "draft" as "draft" | "publish"
});

const siteRules: FormRules = {
  domain: [
    { required: true, message: "请输入域名", trigger: "blur" },
    { min: 3, message: "域名至少 3 个字符", trigger: "blur" }
  ],
  contentLanguage: [{ required: true, message: "请选择语言", trigger: "change" }]
};

const selectedSite = computed(() =>
  sites.value.find((site) => site.id === selectedSiteId.value) ?? null
);

function resetSiteForm() {
  siteForm.domain = "";
  siteForm.targetMarket = "";
  siteForm.contentLanguage = "en";
  siteForm.brandVoice = "";
  siteForm.enableWordPress = false;
  siteForm.wpBaseUrl = "";
  siteForm.wpUsername = "";
  siteForm.wpAppPassword = "";
  siteForm.wpPasswordConfigured = false;
  siteForm.wpDefaultStatus = "draft";
}

function openCreateDialog() {
  editingSiteId.value = "";
  resetSiteForm();
  siteDialogVisible.value = true;
}

function openEditDialog(site: SiteItem) {
  editingSiteId.value = site.id;
  siteForm.domain = site.domain;
  siteForm.targetMarket = site.targetMarket ?? "";
  siteForm.contentLanguage = (site.contentLanguage === "zh-CN" ? "zh-CN" : "en") as ContentLanguageCode;
  siteForm.brandVoice = site.brandVoice ?? "";
  siteForm.enableWordPress = site.cmsType === "wordpress";
  siteForm.wpBaseUrl = site.cmsConfig?.baseUrl ?? "";
  siteForm.wpUsername = site.cmsConfig?.username ?? "";
  siteForm.wpAppPassword = "";
  siteForm.wpPasswordConfigured = site.cmsConfig?.hasApplicationPassword ?? false;
  siteForm.wpDefaultStatus = site.cmsConfig?.defaultStatus ?? "draft";
  siteDialogVisible.value = true;
}

function buildSitePayload() {
  const payload = {
    domain: siteForm.domain.trim(),
    targetMarket: siteForm.targetMarket.trim() || undefined,
    contentLanguage: siteForm.contentLanguage,
    brandVoice: siteForm.brandVoice.trim() || undefined
  } as Parameters<typeof createSite>[1];

  if (wordpressCmsUiEnabled && siteForm.enableWordPress) {
    payload.cmsType = "wordpress";
    payload.wordpress = {
      baseUrl: siteForm.wpBaseUrl.trim(),
      username: siteForm.wpUsername.trim(),
      defaultStatus: siteForm.wpDefaultStatus,
      ...(siteForm.wpAppPassword.trim()
        ? { applicationPassword: siteForm.wpAppPassword.trim() }
        : {})
    };
  } else if (editingSiteId.value) {
    payload.cmsType = null;
  }

  return payload;
}

async function submitSiteForm() {
  if (!siteFormRef.value) return;
  await siteFormRef.value.validate(async (valid) => {
    if (!valid) return;
    siteSaving.value = true;
    try {
      const payload = buildSitePayload();

      if (wordpressCmsUiEnabled && siteForm.enableWordPress) {
        if (!payload.wordpress?.baseUrl || !payload.wordpress.username) {
          message("请填写 WordPress 站点 URL 与用户名", { type: "warning" });
          return;
        }
        if (!payload.wordpress.applicationPassword && !siteForm.wpPasswordConfigured) {
          message("请填写 WordPress Application Password", { type: "warning" });
          return;
        }
      }

      if (editingSiteId.value) {
        await updateSite(projectId, editingSiteId.value, payload);
        message("站点已更新", { type: "success" });
      } else {
        const created = await createSite(projectId, payload);
        selectedSiteId.value = created.id;
        message("站点已创建", { type: "success" });
      }

      siteDialogVisible.value = false;
      await loadSites();
    } finally {
      siteSaving.value = false;
    }
  });
}

async function loadSites() {
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId);
    if (!selectedSiteId.value && sites.value.length > 0) {
      selectedSiteId.value = sites.value[0].id;
      await loadPages();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "加载站点失败";
    message(msg, { type: "error" });
  } finally {
    sitesLoading.value = false;
  }
}

async function loadPages() {
  if (!selectedSiteId.value) {
    pages.value = [];
    return;
  }

  pagesLoading.value = true;
  try {
    pages.value = await listSitePages(projectId, selectedSiteId.value);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "加载页面库失败";
    message(msg, { type: "error" });
  } finally {
    pagesLoading.value = false;
  }
}

async function selectSite(siteId: string) {
  selectedSiteId.value = siteId;
  await loadPages();
}

async function handleSync() {
  if (!selectedSiteId.value || syncing.value) return;

  syncing.value = true;
  try {
    const result = await syncSitePages(projectId, selectedSiteId.value);
    message(`同步完成：发现 ${result.discovered} 条，写入 ${result.upserted} 条`, {
      type: "success"
    });
    await loadPages();
  } catch (error) {
    const msg = error instanceof Error ? error.message : "同步失败";
    message(msg, { type: "error" });
  } finally {
    syncing.value = false;
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN");
}

function formatWeight(value: number) {
  if (typeof value !== "number") return "-";
  return value.toFixed(2);
}

onMounted(() => {
  void loadSites();
});
</script>
