<!--
  站点运营配置：域名、语言、品牌语气与公司卖点（AI 写作素材）。

  边界：
  - 不负责：CMS、页面库、工作流（ProjectSettingsView 设置页）
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

      <el-table v-loading="sitesLoading" :data="displayedSites" stripe :row-class-name="siteRowClassName">
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
            <el-button type="primary" link @click="openEditDialog(row as SiteItem)">编辑</el-button>
            <el-button
              v-if="!siteItemHasMinWritingProfile(row as SiteItem)"
              type="warning"
              link
              @click="openEditDialog(row as SiteItem, 'profile')"
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
                  <el-dropdown-item command="attribution">归因导出</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!sitesLoading && displayedSites.length === 0" :description="sitesEmptyHint" />
    </el-card>

    <el-dialog
      v-model="siteDialogVisible"
      :title="editingSiteId ? '编辑站点' : '新建站点'"
      width="640px"
      destroy-on-close
    >
      <el-form
        v-if="!editingSiteId"
        ref="siteFormRef"
        :model="siteForm"
        :rules="siteRules"
        label-width="100px"
      >
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
        <p class="text-xs text-gray-500">保存后可在列表中「完善素材」，填写行业与卖点后即可创建任务。</p>
      </el-form>

      <el-form
        v-else
        ref="siteFormRef"
        :model="siteForm"
        :rules="siteRules"
        label-width="100px"
      >
        <el-tabs v-model="siteFormTab">
          <el-tab-pane label="基础信息" name="basic">
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
              <p class="mt-1 text-xs text-gray-500">{{ outputLanguageHint }}</p>
            </el-form-item>
            <el-form-item label="品牌语气" prop="brandVoice">
              <el-input
                v-model="siteForm.brandVoice"
                type="textarea"
                :rows="2"
                maxlength="2000"
                show-word-limit
                placeholder="例如：专业务实，面向采购与工程师读者"
              />
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
          </el-tab-pane>

          <el-tab-pane label="写作素材" name="profile">
            <p class="mb-4 text-sm text-gray-500">
              填一次，该站点下每篇新文章生成时都会自动带上。
            </p>
            <el-form-item label="主营行业">
              <el-input
                v-model="siteForm.industry"
                maxlength="200"
                placeholder="例如：工业阀门制造商，面向石化、电力行业"
              />
            </el-form-item>
            <el-form-item label="核心产品线">
              <el-input
                v-model="siteForm.productLines"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="例如：球阀、蝶阀、闸阀；石化、电力、水处理"
              />
            </el-form-item>
            <el-form-item label="差异化卖点">
              <div class="space-y-2 w-full">
                <el-input
                  v-model="siteForm.differentiator1"
                  maxlength="200"
                  placeholder="卖点 1：例如 15 年 OEM/ODM 经验"
                />
                <el-input v-model="siteForm.differentiator2" maxlength="200" placeholder="卖点 2（可选）" />
                <el-input v-model="siteForm.differentiator3" maxlength="200" placeholder="卖点 3（可选）" />
              </div>
            </el-form-item>
            <p class="mb-4 text-xs text-gray-500">
              填好「主营行业」和至少一项卖点（产品线或差异化卖点）即可创建文章任务。
            </p>
            <el-form-item label="认证资质">
              <el-input
                v-model="siteForm.certifications"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="例如：ISO 9001、CE、UL"
              />
            </el-form-item>
            <el-form-item label="起订量 / 交期">
              <el-input
                v-model="siteForm.moqLeadTime"
                maxlength="300"
                placeholder="例如：MOQ 100 pcs, lead time 15–25 days"
              />
            </el-form-item>
            <el-form-item v-if="contentProfilePreview" label="生成预览">
              <div class="rounded bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                {{ contentProfilePreview }}
              </div>
            </el-form-item>
          </el-tab-pane>

          <el-tab-pane label="发布引导" name="publish">
            <el-form-item label="文末引导文案">
              <el-input
                v-model="siteForm.ctaPrimaryText"
                maxlength="120"
                placeholder="例如：获取报价、联系工程师"
              />
              <p class="mt-1 text-xs text-gray-500">文末引导读者询盘或联系的按钮文案。</p>
            </el-form-item>
            <el-form-item label="引导链接">
              <el-input
                v-model="siteForm.ctaPrimaryUrl"
                maxlength="500"
                placeholder="https://example.com/contact"
              />
            </el-form-item>
          </el-tab-pane>

          <el-tab-pane label="更多" name="more">
            <el-form-item label="目标客户">
              <el-input
                v-model="siteForm.targetBuyerType"
                maxlength="120"
                placeholder="例如：采购经理、工程承包商"
              />
            </el-form-item>
            <el-form-item label="案例 / 客户">
              <el-input
                v-model="siteForm.caseHighlights"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="例如：服务过北美石化分销商"
              />
            </el-form-item>
            <el-form-item label="禁用词">
              <el-input
                v-model="siteForm.forbiddenTerms"
                type="textarea"
                :rows="2"
                maxlength="500"
                placeholder="每行或逗号分隔，例如：最便宜、100% 保证"
              />
            </el-form-item>
            <p class="mb-3 text-xs text-gray-500">
              UTM 用于统计哪篇文章带来点击，配合「归因导出」与 Google Analytics。
            </p>
            <el-form-item label="UTM 来源">
              <el-input v-model="siteForm.utmSource" maxlength="80" placeholder="seo-factory" />
            </el-form-item>
            <el-form-item label="UTM 媒介">
              <el-input v-model="siteForm.utmMedium" maxlength="80" placeholder="blog" />
            </el-form-item>
            <el-form-item label="UTM 活动">
              <el-input v-model="siteForm.utmCampaign" maxlength="120" placeholder="industrial-valves" />
            </el-form-item>
          </el-tab-pane>
        </el-tabs>
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
import { useRoute, useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import { createSite, exportSiteAttributionCsv, listSites, updateSite } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import { listProjectMembers, type OrgProjectMember } from "@/api/org/projects";
import {
  CONTENT_LANGUAGE_OPTIONS,
  TARGET_MARKET_OPTIONS,
  type ContentLanguageCode
} from "@/constants/dicts/seo-factory";
import { dictLabel } from "@/utils/dict";
import { message } from "@/utils/message";
import { siteItemHasMinWritingProfile } from "@/utils/seo-factory/site-writing-profile";
import { formatTargetMarketsLabel, parseTargetMarkets } from "@/utils/seo-factory/target-market";
import { useProjectSeoAccess } from "@/composables/seo-factory/useProjectSeoAccess";

defineOptions({ name: "SiteManageView" });

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const { can } = useProjectSeoAccess();
const canManageSite = computed(() => can("seo:site:manage"));

const sitesLoading = ref(false);
const siteSaving = ref(false);
const exportingSiteId = ref("");
const mySitesOnly = ref(false);
const sites = ref<SiteItem[]>([]);
const projectMembers = ref<OrgProjectMember[]>([]);
const siteDialogVisible = ref(false);
const editingSiteId = ref("");
const siteFormTab = ref<"basic" | "profile" | "publish" | "more">("basic");
const siteFormRef = ref<FormInstance>();

const contentLanguageOptions = CONTENT_LANGUAGE_OPTIONS;
const targetMarketOptions = TARGET_MARKET_OPTIONS;

const siteForm = reactive({
  domain: "",
  targetMarkets: [] as string[],
  contentLanguage: "en" as ContentLanguageCode,
  brandVoice: "",
  industry: "",
  certifications: "",
  moqLeadTime: "",
  ctaPrimaryText: "",
  ctaPrimaryUrl: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  productLines: "",
  differentiator1: "",
  differentiator2: "",
  differentiator3: "",
  targetBuyerType: "",
  caseHighlights: "",
  forbiddenTerms: "",
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

const sitesEmptyHint = computed(() =>
  profileMissingFilter.value ? "所有站点均已达标" : "暂无站点，请先新建站点"
);

function contentLanguageLabel(code?: string | null) {
  return dictLabel(contentLanguageOptions, code, "-");
}

const outputLanguageHint = computed(() =>
  siteForm.contentLanguage === "zh-CN"
    ? "文章标题与正文将生成简体中文，建议下方写作素材也用中文填写。"
    : "文章标题与正文将生成英文，建议下方写作素材也用英文填写。"
);

const contentProfilePreview = computed(() => {
  const lines: string[] = [];
  if (siteForm.industry.trim()) lines.push(`主营：${siteForm.industry.trim()}`);
  if (siteForm.productLines.trim()) lines.push(`产品线：${siteForm.productLines.trim()}`);
  const diffs = [siteForm.differentiator1, siteForm.differentiator2, siteForm.differentiator3]
    .map((item) => item.trim())
    .filter(Boolean);
  if (diffs.length) lines.push(`卖点：${diffs.join("；")}`);
  if (siteForm.targetBuyerType.trim()) lines.push(`客户：${siteForm.targetBuyerType.trim()}`);
  if (siteForm.certifications.trim()) lines.push(`资质：${siteForm.certifications.trim()}`);
  if (siteForm.moqLeadTime.trim()) lines.push(`起订/交期：${siteForm.moqLeadTime.trim()}`);
  if (siteForm.caseHighlights.trim()) lines.push(`案例：${siteForm.caseHighlights.trim()}`);
  if (siteForm.ctaPrimaryText.trim()) {
    const url = siteForm.ctaPrimaryUrl.trim();
    lines.push(`文末引导：${siteForm.ctaPrimaryText.trim()}${url ? ` → ${url}` : ""}`);
  }
  if (siteForm.forbiddenTerms.trim()) {
    lines.push(`禁用词：${parseForbiddenTerms(siteForm.forbiddenTerms).join("、")}`);
  }
  return lines.join("\n");
});

function ownerLabel(site: SiteItem): string {
  if (!site.ownerUserId) return "-";
  const member = projectMembers.value.find((item) => item.userId === site.ownerUserId);
  return member?.name || member?.email || site.ownerUserId.slice(0, 8);
}

function onOwnerFilterChange() {
  void loadSites();
}

async function downloadAttribution(site: SiteItem) {
  exportingSiteId.value = site.id;
  try {
    const blob = await exportSiteAttributionCsv(projectId, site.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attribution-${site.domain.replace(/[^\w.-]+/g, "_")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    message("归因 CSV 已下载", { type: "success" });
  } catch (error) {
    message(error instanceof Error ? error.message : "导出失败", { type: "error" });
  } finally {
    exportingSiteId.value = "";
  }
}

function parseForbiddenTerms(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildDifferentiators(): string[] | undefined {
  const items = [siteForm.differentiator1, siteForm.differentiator2, siteForm.differentiator3]
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  return items.length > 0 ? items : undefined;
}

function siteRowClassName({ row }: { row: SiteItem }) {
  return !siteItemHasMinWritingProfile(row) ? "site-row--profile-missing" : "";
}

function clearProfileFilter() {
  router.replace({ name: "SeoFactorySites", params: { projectId } });
}

function resetSiteForm() {
  siteForm.domain = "";
  siteForm.targetMarkets = [];
  siteForm.contentLanguage = "en";
  siteForm.brandVoice = "";
  siteForm.industry = "";
  siteForm.certifications = "";
  siteForm.moqLeadTime = "";
  siteForm.ctaPrimaryText = "";
  siteForm.ctaPrimaryUrl = "";
  siteForm.utmSource = "";
  siteForm.utmMedium = "";
  siteForm.utmCampaign = "";
  siteForm.productLines = "";
  siteForm.differentiator1 = "";
  siteForm.differentiator2 = "";
  siteForm.differentiator3 = "";
  siteForm.targetBuyerType = "";
  siteForm.caseHighlights = "";
  siteForm.forbiddenTerms = "";
  siteForm.ownerUserId = "";
}

function handleSiteRowMore(command: string, site: SiteItem) {
  if (command === "attribution") {
    void downloadAttribution(site);
  }
}

function openCreateDialog() {
  editingSiteId.value = "";
  siteFormTab.value = "basic";
  resetSiteForm();
  siteDialogVisible.value = true;
}

function openEditDialog(site: SiteItem, tab: "basic" | "profile" | "publish" | "more" = "basic") {
  editingSiteId.value = site.id;
  siteFormTab.value = tab;
  siteForm.domain = site.domain;
  siteForm.targetMarkets = parseTargetMarkets(site.targetMarkets ?? site.targetMarket);
  siteForm.contentLanguage = (site.contentLanguage === "zh-CN" ? "zh-CN" : "en") as ContentLanguageCode;
  siteForm.brandVoice = site.brandVoice ?? "";
  siteForm.industry = site.contentProfile?.industry ?? "";
  siteForm.certifications = site.contentProfile?.certifications ?? "";
  siteForm.moqLeadTime = site.contentProfile?.moqLeadTime ?? "";
  siteForm.ctaPrimaryText = site.contentProfile?.ctaPrimaryText ?? "";
  siteForm.ctaPrimaryUrl = site.contentProfile?.ctaPrimaryUrl ?? "";
  siteForm.utmSource = site.contentProfile?.utmSource ?? "";
  siteForm.utmMedium = site.contentProfile?.utmMedium ?? "";
  siteForm.utmCampaign = site.contentProfile?.utmCampaign ?? "";
  siteForm.productLines = site.contentProfile?.productLines ?? "";
  siteForm.differentiator1 = site.contentProfile?.differentiators?.[0] ?? "";
  siteForm.differentiator2 = site.contentProfile?.differentiators?.[1] ?? "";
  siteForm.differentiator3 = site.contentProfile?.differentiators?.[2] ?? "";
  siteForm.targetBuyerType = site.contentProfile?.targetBuyerType ?? "";
  siteForm.caseHighlights = site.contentProfile?.caseHighlights ?? "";
  siteForm.forbiddenTerms = site.contentProfile?.forbiddenTerms?.join("，") ?? "";
  siteForm.ownerUserId = site.ownerUserId ?? "";
  siteDialogVisible.value = true;
}

function buildSitePayload() {
  return {
    domain: siteForm.domain.trim(),
    targetMarkets: siteForm.targetMarkets.length ? siteForm.targetMarkets : undefined,
    contentLanguage: siteForm.contentLanguage,
    brandVoice: siteForm.brandVoice.trim() || undefined,
    contentProfile: {
      industry: siteForm.industry.trim() || undefined,
      certifications: siteForm.certifications.trim() || undefined,
      moqLeadTime: siteForm.moqLeadTime.trim() || undefined,
      ctaPrimaryText: siteForm.ctaPrimaryText.trim() || undefined,
      ctaPrimaryUrl: siteForm.ctaPrimaryUrl.trim() || undefined,
      utmSource: siteForm.utmSource.trim() || undefined,
      utmMedium: siteForm.utmMedium.trim() || undefined,
      utmCampaign: siteForm.utmCampaign.trim() || undefined,
      productLines: siteForm.productLines.trim() || undefined,
      differentiators: buildDifferentiators(),
      targetBuyerType: siteForm.targetBuyerType.trim() || undefined,
      caseHighlights: siteForm.caseHighlights.trim() || undefined,
      forbiddenTerms: (() => {
        const terms = parseForbiddenTerms(siteForm.forbiddenTerms);
        return terms.length > 0 ? terms : undefined;
      })()
    }
  } as Parameters<typeof createSite>[1];
}

async function submitSiteForm() {
  if (!siteFormRef.value) return;
  await siteFormRef.value.validate(async (valid) => {
    if (!valid) return;
    siteSaving.value = true;
    try {
      const payload = buildSitePayload();

      if (editingSiteId.value) {
        await updateSite(projectId, editingSiteId.value, {
          ...payload,
          ownerUserId: siteForm.ownerUserId.trim() || null
        });
        message("站点已更新", { type: "success" });
      } else {
        const created = await createSite(projectId, payload);
        if (siteForm.ownerUserId.trim()) {
          await updateSite(projectId, created.id, {
            ownerUserId: siteForm.ownerUserId.trim()
          });
        }
        message("站点已创建，请完善写作素材后再创建任务", { type: "success" });
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
    sites.value = await listSites(projectId, mySitesOnly.value ? { siteOwner: "me" } : undefined);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "加载站点失败";
    message(msg, { type: "error" });
  } finally {
    sitesLoading.value = false;
  }
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
