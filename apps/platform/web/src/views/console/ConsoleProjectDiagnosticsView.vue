<!--
  Console 项目诊断：评分门槛、校准开关与 SERP 高级参数（平台管理员）。

  边界：
  - 不负责：企业运营向流程开关（ProjectSettingsView）
-->
<template>
  <div class="p-4 space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 class="text-lg font-medium">项目诊断</h1>
        <p class="text-sm text-gray-500">
          跨企业调整评分门槛、校准策略与搜索结果竞品参数。日常运营开关请在企业项目「项目配置」中修改。
        </p>
      </div>
      <div class="flex gap-2">
        <el-button plain @click="goScoreLab">评分校准实验室</el-button>
        <el-button plain @click="goContentScore">内容评分试算</el-button>
      </div>
    </div>

    <ConsoleProjectScopeBar />

    <el-empty v-if="!projectId" description="请先选择企业与 SEO 项目" />

    <template v-else>
      <el-card v-loading="sitesLoading" shadow="never">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium">高级参数（按站点）</span>
            <div class="flex flex-wrap gap-2">
              <el-select
                v-model="selectedSiteId"
                placeholder="选择站点"
                style="width: 220px"
                @change="onSiteChange"
              >
                <el-option
                  v-for="site in sites"
                  :key="site.id"
                  :label="site.domain"
                  :value="site.id"
                />
              </el-select>
              <el-button type="primary" :loading="saving" :disabled="!selectedSiteId" @click="submitForm">
                保存
              </el-button>
            </div>
          </div>
        </template>

        <el-empty v-if="!sitesLoading && sites.length === 0" description="该项目暂无站点" />

        <el-form v-else :model="adminForm" label-width="120px">
          <el-collapse class="mb-2">
            <el-collapse-item title="评分门槛与重试" name="score-thresholds">
              <el-form-item label="本地通过分">
                <el-input-number v-model="adminForm.localPassThreshold" :min="70" :max="100" :step="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="Semrush 通过分">
                <el-input-number v-model="adminForm.semrushPassThreshold" :min="7" :max="10" :step="0.1" :precision="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="本地优化轮次">
                <el-input-number v-model="adminForm.localMaxOptimizeRounds" :min="1" :max="15" :step="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="本地重试追加">
                <el-input-number v-model="adminForm.localRetryExtraRounds" :min="0" :max="10" :step="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="Semrush 优化轮次">
                <el-input-number v-model="adminForm.semrushMaxOptimizeRounds" :min="1" :max="15" :step="1" controls-position="right" />
              </el-form-item>
              <el-form-item label="Semrush 重试追加">
                <el-input-number v-model="adminForm.semrushRetryExtraRounds" :min="0" :max="10" :step="1" controls-position="right" />
              </el-form-item>
            </el-collapse-item>
            <el-collapse-item title="评分校准" name="score-calibration">
              <el-form-item label="影子日志">
                <el-switch v-model="adminForm.scoreCalibrationShadow" />
              </el-form-item>
              <el-form-item label="降频 RPA">
                <el-switch v-model="adminForm.scoreCalibrationReduceRpa" />
                <el-alert
                  v-if="showReduceRpaIneffectiveWarning"
                  class="mt-2"
                  type="warning"
                  :closable="false"
                  show-icon
                  title="已开启但未生效"
                  :description="reduceRpaIneffectiveHint"
                />
              </el-form-item>
              <el-form-item label="本地对齐 Sem">
                <el-switch v-model="adminForm.scoreCalibrationLocalAlign" />
                <el-alert
                  v-if="showLocalAlignIneffectiveWarning"
                  class="mt-2"
                  type="warning"
                  :closable="false"
                  show-icon
                  title="已开启但未生效"
                  :description="localAlignIneffectiveHint"
                />
              </el-form-item>
            </el-collapse-item>
          </el-collapse>

          <el-divider content-position="left">搜索结果 / 竞品分析</el-divider>

          <el-form-item label="参考竞品篇数">
            <el-input-number v-model="adminForm.serpArticleLimit" :min="1" :max="20" />
          </el-form-item>
          <el-form-item label="只分析标准文章">
            <el-switch v-model="adminForm.serpArticlesOnly" />
          </el-form-item>

          <el-collapse>
            <el-collapse-item title="竞品分析高级参数" name="serp-advanced">
              <el-form-item label="Google 抓取条数">
                <el-input-number v-model="adminForm.serpOrganicFetchNum" :min="10" :max="50" :step="5" />
              </el-form-item>
              <el-form-item label="搜索缓存">
                <el-select v-model="adminForm.serpCacheTtlHours" class="w-full">
                  <el-option
                    v-for="item in serpCacheTtlOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label=" ">
                <el-button :loading="clearingSerpCache" :disabled="!selectedSiteId" @click="handleClearSerpCache">
                  清除搜索缓存
                </el-button>
              </el-form-item>
            </el-collapse-item>
          </el-collapse>
        </el-form>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getScoreCalibrationReadiness,
  type ScoreCalibrationReadiness
} from "@/api/seo-factory/score-calibration";
import { clearSiteSerpCache, listSites, updateSite } from "@/api/seo-factory/site";
import type { SiteItem } from "@/api/seo-factory/types";
import {
  LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  LOCAL_SEO_PASS_THRESHOLD,
  LOCAL_SEO_RETRY_EXTRA_ROUNDS,
  SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  SEMRUSH_PASS_THRESHOLD,
  SEMRUSH_RETRY_EXTRA_ROUNDS
} from "@/constants/seo-factory";
import { scoreCalibrationReadinessDict } from "@/constants/dicts/score-calibration";
import { dictLabel } from "@/utils/dict";
import { message } from "@/utils/message";
import { isPlatformOperatorUser } from "@/utils/platform-operator-access";
import { useConsoleProjectScope } from "@/composables/console/useConsoleProjectScope";
import ConsoleProjectScopeBar from "./components/ConsoleProjectScopeBar.vue";

defineOptions({ name: "ConsoleProjectDiagnosticsView" });

const route = useRoute();
const router = useRouter();
const { projectId, organizationId, syncFromRoute } = useConsoleProjectScope();

const sitesLoading = ref(false);
const saving = ref(false);
const clearingSerpCache = ref(false);
const sites = ref<SiteItem[]>([]);
const selectedSiteId = ref("");
const calibrationReadiness = ref<ScoreCalibrationReadiness | null>(null);

const serpCacheTtlOptions = [
  { value: 0, label: "不缓存" },
  { value: 6, label: "6 小时" },
  { value: 12, label: "12 小时" },
  { value: 24, label: "24 小时（推荐）" },
  { value: 48, label: "48 小时" },
  { value: 168, label: "7 天" }
];

const adminForm = reactive({
  scoreCalibrationShadow: true,
  scoreCalibrationReduceRpa: false,
  scoreCalibrationLocalAlign: false,
  localPassThreshold: LOCAL_SEO_PASS_THRESHOLD,
  semrushPassThreshold: SEMRUSH_PASS_THRESHOLD,
  localMaxOptimizeRounds: LOCAL_SEO_MAX_OPTIMIZE_ROUNDS,
  localRetryExtraRounds: LOCAL_SEO_RETRY_EXTRA_ROUNDS,
  semrushMaxOptimizeRounds: SEMRUSH_MAX_OPTIMIZE_ROUNDS,
  semrushRetryExtraRounds: SEMRUSH_RETRY_EXTRA_ROUNDS,
  serpArticleLimit: 5,
  serpArticlesOnly: true,
  serpOrganicFetchNum: 30,
  serpMinArticleCandidates: 3,
  serpCacheTtlHours: 24
});

const showReduceRpaIneffectiveWarning = computed(
  () => adminForm.scoreCalibrationReduceRpa && calibrationReadiness.value?.reduceRpaEffective === false
);

const showLocalAlignIneffectiveWarning = computed(
  () =>
    adminForm.scoreCalibrationLocalAlign &&
    calibrationReadiness.value?.state !== "production_ready"
);

const reduceRpaIneffectiveHint = computed(() => {
  const r = calibrationReadiness.value;
  if (!r) return "正在加载就绪状态…";
  const stateLabel = dictLabel(scoreCalibrationReadinessDict, r.state);
  const parts: string[] = [`当前：${stateLabel}`];
  if (r.gaps.samplesNeeded > 0) parts.push(`还需 ${r.gaps.samplesNeeded} 条训练样本`);
  if (r.holdoutMae !== null) parts.push(`验证 MAE ${r.holdoutMae}（生产门槛 ≤0.35）`);
  parts.push("优化轮仍会调用 Semrush RPA。");
  return parts.join("；");
});

const localAlignIneffectiveHint = computed(() => {
  const r = calibrationReadiness.value;
  if (!r) return "正在加载就绪状态…";
  const stateLabel = dictLabel(scoreCalibrationReadinessDict, r.state);
  const parts: string[] = [`当前：${stateLabel}`];
  if (r.gaps.samplesNeeded > 0) parts.push(`还需 ${r.gaps.samplesNeeded} 条训练样本`);
  if (r.holdoutMae !== null) parts.push(`验证 MAE ${r.holdoutMae}（生产门槛 ≤0.35）`);
  parts.push("未就绪时仍用本地 0–100 规则分进门闸。");
  return parts.join("；");
});

function resetAdminForm() {
  adminForm.scoreCalibrationShadow = true;
  adminForm.scoreCalibrationReduceRpa = false;
  adminForm.scoreCalibrationLocalAlign = false;
  adminForm.localPassThreshold = LOCAL_SEO_PASS_THRESHOLD;
  adminForm.semrushPassThreshold = SEMRUSH_PASS_THRESHOLD;
  adminForm.localMaxOptimizeRounds = LOCAL_SEO_MAX_OPTIMIZE_ROUNDS;
  adminForm.localRetryExtraRounds = LOCAL_SEO_RETRY_EXTRA_ROUNDS;
  adminForm.semrushMaxOptimizeRounds = SEMRUSH_MAX_OPTIMIZE_ROUNDS;
  adminForm.semrushRetryExtraRounds = SEMRUSH_RETRY_EXTRA_ROUNDS;
  adminForm.serpArticleLimit = 5;
  adminForm.serpArticlesOnly = true;
  adminForm.serpOrganicFetchNum = 30;
  adminForm.serpMinArticleCandidates = 3;
  adminForm.serpCacheTtlHours = 24;
}

function loadAdminFormFromSite(site: SiteItem) {
  resetAdminForm();
  adminForm.scoreCalibrationShadow = site.workflow?.scoreCalibrationShadow !== false;
  adminForm.scoreCalibrationReduceRpa = site.workflow?.scoreCalibrationReduceRpa === true;
  adminForm.scoreCalibrationLocalAlign = site.workflow?.scoreCalibrationLocalAlign === true;
  adminForm.localPassThreshold = site.workflow?.localPassThreshold ?? LOCAL_SEO_PASS_THRESHOLD;
  adminForm.semrushPassThreshold = site.workflow?.semrushPassThreshold ?? SEMRUSH_PASS_THRESHOLD;
  adminForm.localMaxOptimizeRounds =
    site.workflow?.localMaxOptimizeRounds ?? LOCAL_SEO_MAX_OPTIMIZE_ROUNDS;
  adminForm.localRetryExtraRounds =
    site.workflow?.localRetryExtraRounds ?? LOCAL_SEO_RETRY_EXTRA_ROUNDS;
  adminForm.semrushMaxOptimizeRounds =
    site.workflow?.semrushMaxOptimizeRounds ?? SEMRUSH_MAX_OPTIMIZE_ROUNDS;
  adminForm.semrushRetryExtraRounds =
    site.workflow?.semrushRetryExtraRounds ?? SEMRUSH_RETRY_EXTRA_ROUNDS;
  adminForm.serpArticleLimit = site.serpResearch?.articleLimit ?? 5;
  adminForm.serpArticlesOnly = site.serpResearch?.articlesOnly !== false;
  adminForm.serpOrganicFetchNum = site.serpResearch?.organicFetchNum ?? 30;
  adminForm.serpMinArticleCandidates = site.serpResearch?.minArticleCandidates ?? 3;
  adminForm.serpCacheTtlHours = site.serpResearch?.cacheTtlHours ?? 24;
}

function onSiteChange() {
  const site = sites.value.find((item) => item.id === selectedSiteId.value);
  if (site) loadAdminFormFromSite(site);
}

function buildPayload() {
  return {
    workflow: {
      scoreCalibrationShadow: adminForm.scoreCalibrationShadow,
      scoreCalibrationReduceRpa: adminForm.scoreCalibrationReduceRpa,
      scoreCalibrationLocalAlign: adminForm.scoreCalibrationLocalAlign,
      localPassThreshold: adminForm.localPassThreshold,
      semrushPassThreshold: adminForm.semrushPassThreshold,
      localMaxOptimizeRounds: adminForm.localMaxOptimizeRounds,
      localRetryExtraRounds: adminForm.localRetryExtraRounds,
      semrushMaxOptimizeRounds: adminForm.semrushMaxOptimizeRounds,
      semrushRetryExtraRounds: adminForm.semrushRetryExtraRounds
    },
    serpResearch: {
      articleLimit: adminForm.serpArticleLimit,
      articlesOnly: adminForm.serpArticlesOnly,
      organicFetchNum: adminForm.serpOrganicFetchNum,
      minArticleCandidates: adminForm.serpMinArticleCandidates,
      cacheTtlHours: adminForm.serpCacheTtlHours
    }
  } satisfies Parameters<typeof updateSite>[2];
}

async function submitForm() {
  if (!projectId.value || !selectedSiteId.value) return;
  saving.value = true;
  try {
    await updateSite(projectId.value, selectedSiteId.value, buildPayload());
    message("诊断参数已保存", { type: "success" });
    await loadSites();
  } finally {
    saving.value = false;
  }
}

async function handleClearSerpCache() {
  if (!projectId.value || !selectedSiteId.value) return;
  clearingSerpCache.value = true;
  try {
    const result = await clearSiteSerpCache(projectId.value, selectedSiteId.value);
    message(`已清除 ${result.deleted} 条搜索缓存`, { type: "success" });
  } finally {
    clearingSerpCache.value = false;
  }
}

async function loadCalibrationReadiness() {
  if (!projectId.value) {
    calibrationReadiness.value = null;
    return;
  }
  try {
    calibrationReadiness.value = await getScoreCalibrationReadiness(projectId.value);
  } catch {
    calibrationReadiness.value = null;
  }
}

async function loadSites() {
  if (!projectId.value) {
    sites.value = [];
    selectedSiteId.value = "";
    return;
  }
  sitesLoading.value = true;
  try {
    sites.value = await listSites(projectId.value);
    if (!selectedSiteId.value && sites.value.length > 0) {
      selectedSiteId.value = sites.value[0].id;
    }
    const site = sites.value.find((item) => item.id === selectedSiteId.value);
    if (site) loadAdminFormFromSite(site);
  } finally {
    sitesLoading.value = false;
  }
}

function scopeQuery() {
  const query: Record<string, string> = {};
  if (organizationId.value) query.organizationId = organizationId.value;
  if (projectId.value) query.projectId = projectId.value;
  return query;
}

function goScoreLab() {
  router.push({ name: "ConsoleScoreLab", query: scopeQuery() });
}

function goContentScore() {
  router.push({ name: "ConsoleContentScore", query: scopeQuery() });
}

watch(projectId, () => {
  void loadSites();
  void loadCalibrationReadiness();
});

onMounted(() => {
  if (!isPlatformOperatorUser()) {
    void router.replace({ path: "/error/403" });
    return;
  }
  syncFromRoute();
  void loadSites();
  void loadCalibrationReadiness();
});
</script>
