<!--
  企业项目首页：展示当前企业下的内容生产项目，作为进入工作台的入口。
  边界：
  - 不负责：项目内部业务（由 project-type 插件页面处理）
  - 不负责：企业成员与配额管理（见 OrganizationSettingsView）
-->
<template>
  <div class="project-home">
    <header v-loading="profileLoading" class="home-hero">
      <div class="home-hero__content">
        <div class="home-hero__kicker">
          <span class="home-hero__pulse" />
          外贸内容增长中枢
        </div>
        <h1 class="home-hero__title">{{ orgName }}</h1>
        <p class="home-hero__desc">
          {{ greeting }}。在这里统一管理不同市场、站点和品牌线的 SEO
          内容生产项目， 让选题、关键词、文章任务和发布协作保持在同一个节奏里。
        </p>

        <div class="home-hero__actions">
          <el-button type="primary" size="large" @click="openCreateDialog">
            <IconifyIconOnline icon="ri:add-line" class="button-icon" />
            新建项目
          </el-button>
          <el-button size="large" :loading="loading" @click="fetchProjects">
            <IconifyIconOnline icon="ri:refresh-line" class="button-icon" />
            刷新
          </el-button>
        </div>
      </div>

      <aside v-if="profile" class="home-hero__panel" aria-label="企业运营概览">
        <div class="quota-card" :class="quotaCardClass">
          <div class="quota-card__head">
            <div>
              <span class="quota-card__label">本月内容配额</span>
              <strong class="quota-card__value">{{
                profile.quota.remaining
              }}</strong>
            </div>
            <el-tag :type="quotaTagType" effect="plain">{{
              quotaStatusText
            }}</el-tag>
          </div>
          <el-progress
            :percentage="quotaPercent"
            :status="
              quotaPercent >= 90
                ? 'exception'
                : quotaPercent >= 70
                  ? 'warning'
                  : 'success'
            "
            :stroke-width="8"
            :show-text="false"
          />
          <p class="quota-card__meta">
            已占用 {{ profile.quota.reservedTotal }} /
            {{ profile.quota.monthlyQuota }} 篇
          </p>
        </div>

        <div class="hero-metrics">
          <div class="hero-metric">
            <span class="hero-metric__value">{{ profile.projectCount }}</span>
            <span class="hero-metric__label">项目线</span>
          </div>
          <div class="hero-metric">
            <span class="hero-metric__value">{{ activeProjects.length }}</span>
            <span class="hero-metric__label">运行中</span>
          </div>
          <div class="hero-metric">
            <span class="hero-metric__value">{{ profile.memberCount }}</span>
            <span class="hero-metric__label">协作成员</span>
          </div>
        </div>

        <div v-if="isAdmin" class="admin-links">
          <el-button link type="primary" @click="goOrganization">
            <IconifyIconOnline icon="ri:settings-3-line" class="button-icon" />
            企业设置
          </el-button>
          <el-button link type="primary" @click="goBilling">
            <IconifyIconOnline icon="ri:line-chart-line" class="button-icon" />
            用量统计
          </el-button>
        </div>
      </aside>
    </header>

    <section class="ops-strip" aria-label="项目运营重点">
      <article
        v-for="item in operationCards"
        :key="item.title"
        class="ops-item"
      >
        <div class="ops-item__icon">
          <IconifyIconOnline :icon="item.icon" />
        </div>
        <div>
          <h2 class="ops-item__title">{{ item.title }}</h2>
          <p class="ops-item__text">{{ item.text }}</p>
        </div>
      </article>
    </section>

    <section class="project-section">
      <div class="section-head">
        <div>
          <p class="section-head__eyebrow">Project Workspace</p>
          <h2 class="section-head__title">企业项目</h2>
          <p class="section-head__desc">
            按品牌、市场或站点拆分项目，便于团队独立推进关键词池、内容排期和发布质量。
          </p>
        </div>
        <div class="section-head__actions">
          <el-button @click="openCreateDialog">
            <IconifyIconOnline icon="ri:add-circle-line" class="button-icon" />
            新建企业项目
          </el-button>
        </div>
      </div>

      <div
        v-if="
          !loading &&
          activeProjects.length === 0 &&
          archivedProjects.length === 0
        "
        class="empty-state"
      >
        <div class="empty-state__visual" aria-hidden="true">
          <IconifyIconOnline icon="ri:global-line" />
        </div>
        <h3 class="empty-state__title">创建团队的第一条内容增长线</h3>
        <p class="empty-state__text">
          建议以品牌、国家市场或站点命名，例如“北美官网 SEO”或“欧洲博客矩阵”。
          创建后配置站点与关键词池，即可开始批量生产文章。
        </p>
        <el-button type="primary" size="large" @click="openCreateDialog">
          <IconifyIconOnline icon="ri:add-line" class="button-icon" />
          新建企业项目
        </el-button>
      </div>

      <div v-else v-loading="loading" class="project-content">
        <div class="project-grid">
          <article
            v-for="project in activeProjects"
            :key="project.id"
            class="project-card"
            :class="{ 'project-card--clickable': canEnter(project) }"
            @click="canEnter(project) ? enterProject(project) : undefined"
          >
            <div class="project-card__top">
              <div class="project-card__icon" aria-hidden="true">
                <IconifyIconOnline :icon="projectIcon(project.projectType)" />
              </div>
              <el-tag
                :type="dictTagType(projectStatusDict, project.status)"
                size="small"
                effect="plain"
              >
                {{ dictLabel(projectStatusDict, project.status) }}
              </el-tag>
            </div>

            <div class="project-card__body">
              <h3 class="project-card__name">{{ project.name }}</h3>
              <p class="project-card__type">
                {{ projectTypeLabel(project.projectType) }}
              </p>
              <p class="project-card__hint">
                {{ projectTypeHint(project.projectType) }}
              </p>
            </div>

            <div class="project-card__meta">
              <span>
                <IconifyIconOnline icon="ri:calendar-line" />
                {{
                  project.createdAt
                    ? formatDate(project.createdAt)
                    : "创建时间未知"
                }}
              </span>
            </div>

            <div class="project-card__footer" @click.stop>
              <el-button
                v-if="canEnter(project)"
                type="primary"
                class="project-card__enter"
                @click="enterProject(project)"
              >
                进入工作台
                <IconifyIconOnline
                  icon="ri:arrow-right-line"
                  class="button-icon button-icon--right"
                />
              </el-button>
              <el-button link type="primary" @click="goDetail(project.id)"
                >项目详情</el-button
              >
            </div>
          </article>

          <button
            type="button"
            class="project-card project-card--create"
            @click="openCreateDialog"
          >
            <span class="project-card__create-icon" aria-hidden="true">
              <IconifyIconOnline icon="ri:add-line" />
            </span>
            <span class="project-card__create-title">新建企业项目</span>
            <span class="project-card__create-desc"
              >为新的站点、品牌或国家市场创建独立内容生产线</span
            >
          </button>
        </div>

        <el-collapse
          v-if="archivedProjects.length"
          v-model="archivedExpanded"
          class="archived-collapse"
        >
          <el-collapse-item
            :title="`已归档项目（${archivedProjects.length}）`"
            name="archived"
          >
            <div class="project-grid project-grid--compact">
              <article
                v-for="project in archivedProjects"
                :key="project.id"
                class="project-card project-card--archived"
              >
                <div class="project-card__top">
                  <div class="project-card__icon" aria-hidden="true">
                    <IconifyIconOnline
                      :icon="projectIcon(project.projectType)"
                    />
                  </div>
                  <el-tag
                    :type="dictTagType(projectStatusDict, project.status)"
                    size="small"
                    effect="plain"
                  >
                    {{ dictLabel(projectStatusDict, project.status) }}
                  </el-tag>
                </div>
                <h3 class="project-card__name">{{ project.name }}</h3>
                <p class="project-card__type">
                  {{ projectTypeLabel(project.projectType) }}
                </p>
                <div class="project-card__footer">
                  <el-button link type="primary" @click="goDetail(project.id)"
                    >查看详情</el-button
                  >
                </div>
              </article>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </section>

    <el-dialog
      v-model="createVisible"
      title="新建企业项目"
      width="480px"
      destroy-on-close
    >
      <p class="dialog-tip">
        项目归属当前企业，团队成员可按权限共同使用。建议以品牌、地区或业务线命名，
        便于区分多条内容生产线。
      </p>
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="88px"
      >
        <el-form-item label="项目名称" prop="name">
          <el-input
            v-model="createForm.name"
            placeholder="例如：北美官网 SEO、欧洲博客矩阵"
          />
        </el-form-item>
        <el-form-item label="项目类型" prop="projectType">
          <el-select v-model="createForm.projectType" class="w-full">
            <el-option label="SEO 内容工厂" value="seo-factory" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate"
          >创建并进入</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { FormInstance, FormRules } from "element-plus";
import {
  getOrganizationProfile,
  type OrganizationProfile
} from "@/api/platform/organization";
import {
  createProject,
  listProjects,
  type ProjectItem
} from "@/api/platform/project";
import { projectStatusDict } from "@/constants/dicts/platform";
import { useUserStoreHook } from "@/store/modules/user";
import { dictLabel, dictTagType } from "@/utils/dict";
import { message } from "@/utils/message";

defineOptions({ name: "ProjectHomeView" });

const router = useRouter();
const userStore = useUserStoreHook();

const loading = ref(false);
const profileLoading = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const projects = ref<ProjectItem[]>([]);
const profile = ref<OrganizationProfile | null>(null);
const archivedExpanded = ref<string[]>([]);

const createForm = reactive({
  name: "",
  projectType: "seo-factory" as const
});

const createRules: FormRules = {
  name: [{ required: true, message: "请输入项目名称", trigger: "blur" }],
  projectType: [
    { required: true, message: "请选择项目类型", trigger: "change" }
  ]
};

const operationCards = [
  {
    icon: "ri:earth-line",
    title: "多市场拆分",
    text: "按国家、语种和站点独立推进，避免不同市场的关键词与内容计划互相干扰。"
  },
  {
    icon: "ri:flow-chart",
    title: "流程集中",
    text: "把关键词池、SERP 分析、文章任务与发布检查收束到同一条工作流。"
  },
  {
    icon: "ri:shield-check-line",
    title: "质量可控",
    text: "持续关注配额、成员协作和项目状态，让内容生产保持稳定交付。"
  }
];

const isAdmin = computed(() => userStore.roles.includes("admin"));

const orgName = computed(() => profile.value?.name || "我的企业");

const greeting = computed(() => {
  const name = userStore.nickname || userStore.username;
  return name ? `${name}，欢迎回来` : "欢迎回来";
});

const quotaPercent = computed(() => {
  const quota = profile.value?.quota;
  if (!quota || quota.monthlyQuota <= 0) return 0;
  return Math.min(
    100,
    Math.round((quota.reservedTotal / quota.monthlyQuota) * 100)
  );
});

const quotaTagType = computed(() => {
  if (quotaPercent.value >= 90) return "danger";
  if (quotaPercent.value >= 70) return "warning";
  return "success";
});

const quotaStatusText = computed(() => {
  if (quotaPercent.value >= 90) return "即将用尽";
  if (quotaPercent.value >= 70) return "需要关注";
  return "余量充足";
});

const quotaCardClass = computed(() => ({
  "quota-card--warning": quotaPercent.value >= 70 && quotaPercent.value < 90,
  "quota-card--danger": quotaPercent.value >= 90
}));

const activeProjects = computed(() =>
  projects.value.filter(item => item.status === "ACTIVE")
);

const archivedProjects = computed(() =>
  projects.value.filter(item => item.status !== "ACTIVE")
);

function projectTypeLabel(type: string) {
  if (type === "seo-factory") return "SEO 内容工厂";
  return type;
}

function projectTypeHint(type: string) {
  if (type === "seo-factory") {
    return "站点配置、关键词排产、文章生成与发布检查";
  }
  return "企业内容生产项目";
}

function projectIcon(type: string) {
  if (type === "seo-factory") return "ri:search-eye-line";
  return "ri:folder-3-line";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN");
}

function canEnter(project: ProjectItem) {
  return project.projectType === "seo-factory" && project.status === "ACTIVE";
}

async function loadProfile() {
  profileLoading.value = true;
  try {
    profile.value = await getOrganizationProfile();
  } catch {
    profile.value = null;
  } finally {
    profileLoading.value = false;
  }
}

async function fetchProjects() {
  loading.value = true;
  try {
    const result = await listProjects(1, 50);
    projects.value = result.items;
  } finally {
    loading.value = false;
  }
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
      message("企业项目创建成功", { type: "success" });
      createVisible.value = false;
      await Promise.all([fetchProjects(), loadProfile()]);
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

function goOrganization() {
  router.push({ name: "PlatformOrganization" });
}

function goBilling() {
  router.push({ name: "PlatformBilling" });
}

function enterProject(row: ProjectItem) {
  router.push({ name: "SeoFactoryOverview", params: { projectId: row.id } });
}

onMounted(() => {
  void loadProfile();
  void fetchProjects();
});
</script>

<style scoped>
.project-home {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.home-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 22px;
  min-height: 292px;
  padding: 28px;
  overflow: hidden;
  color: var(--shell-text-primary);
  background:
    linear-gradient(135deg, #fff 0%, #f8fafc 62%, #eef6f4 100%),
    #fff;
  border: 1px solid var(--shell-border);
  border-radius: var(--content-radius);
  box-shadow: var(--content-shadow);
}

.home-hero__content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 760px;
}

.home-hero__kicker,
.section-head__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 800;
  color: var(--shell-accent);
}

.home-hero__pulse {
  width: 8px;
  height: 8px;
  background: var(--shell-accent);
  border-radius: 999px;
  box-shadow: 0 0 0 5px rgb(15 118 110 / 12%);
}

.home-hero__title {
  margin: 0;
  font-size: 32px;
  font-weight: 850;
  line-height: 1.18;
  color: var(--shell-text-primary);
}

.home-hero__desc {
  max-width: 660px;
  margin: 14px 0 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--shell-text-secondary);
}

.home-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
}

.home-hero__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-self: stretch;
}

.quota-card {
  padding: 18px;
  background: #fff;
  border: 1px solid rgb(15 118 110 / 18%);
  border-radius: 8px;
  box-shadow: 0 16px 34px rgb(15 23 42 / 8%);
}

.quota-card--warning {
  border-color: rgb(217 119 6 / 24%);
}

.quota-card--danger {
  border-color: rgb(220 38 38 / 24%);
}

.quota-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.quota-card__label,
.hero-metric__label {
  display: block;
  font-size: 12px;
  color: var(--shell-text-muted);
}

.quota-card__value {
  display: block;
  margin-top: 4px;
  font-size: 34px;
  line-height: 1;
  color: var(--shell-text-primary);
}

.quota-card__meta {
  margin: 9px 0 0;
  font-size: 12px;
  color: var(--shell-text-muted);
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hero-metric {
  min-width: 0;
  padding: 14px;
  background: #fff;
  border: 1px solid var(--shell-border);
  border-radius: 8px;
}

.hero-metric__value {
  display: block;
  margin-bottom: 5px;
  font-size: 22px;
  font-weight: 850;
  line-height: 1;
  color: var(--shell-text-primary);
}

.admin-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding-top: 2px;
}

.button-icon {
  width: 1em;
  height: 1em;
  margin-right: 4px;
  vertical-align: -0.14em;
}

.button-icon--right {
  margin-right: 0;
  margin-left: 4px;
}

.ops-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.ops-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  min-height: 116px;
  padding: 18px;
  background: #fff;
  border: 1px solid var(--shell-border);
  border-radius: 8px;
  box-shadow: var(--content-shadow);
}

.ops-item__icon,
.project-card__icon,
.empty-state__visual,
.project-card__create-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ops-item__icon {
  width: 42px;
  height: 42px;
  font-size: 21px;
  color: var(--shell-accent);
  background: var(--shell-accent-soft);
  border-radius: 8px;
}

.ops-item__title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--shell-text-primary);
}

.ops-item__text {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--shell-text-secondary);
}

.project-section {
  padding: 24px;
  background: #fff;
  border: 1px solid var(--shell-border);
  border-radius: var(--content-radius);
  box-shadow: var(--content-shadow);
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.section-head__eyebrow {
  margin-bottom: 6px;
  color: var(--shell-text-muted);
}

.section-head__title {
  margin: 0;
  font-size: 21px;
  font-weight: 850;
  color: var(--shell-text-primary);
}

.section-head__desc {
  max-width: 680px;
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--shell-text-secondary);
}

.section-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 24px;
  text-align: center;
  background: #f8fafc;
  border: 1px dashed rgb(15 118 110 / 28%);
  border-radius: 8px;
}

.empty-state__visual {
  width: 58px;
  height: 58px;
  font-size: 30px;
  color: var(--shell-accent);
  background: var(--shell-accent-soft);
  border-radius: 8px;
}

.empty-state__title {
  margin: 18px 0 8px;
  font-size: 18px;
  font-weight: 800;
  color: var(--shell-text-primary);
}

.empty-state__text {
  max-width: 520px;
  margin: 0 0 24px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--shell-text-secondary);
}

.project-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.project-grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.project-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 244px;
  padding: 20px;
  text-align: left;
  background: #fff;
  border: 1px solid var(--shell-border);
  border-radius: 8px;
  box-shadow: 0 1px 2px rgb(15 23 42 / 5%);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.project-card--clickable {
  cursor: pointer;
}

.project-card--clickable:hover {
  border-color: rgb(15 118 110 / 30%);
  box-shadow: 0 16px 34px rgb(15 23 42 / 8%);
}

.project-card--archived {
  min-height: auto;
  opacity: 0.86;
}

.project-card--create {
  align-items: center;
  justify-content: center;
  min-height: 244px;
  cursor: pointer;
  color: inherit;
  background: #f8fafc;
  border-style: dashed;
  border-color: rgb(15 118 110 / 26%);
}

.project-card--create:hover {
  border-color: rgb(15 118 110 / 44%);
  background: #f0fdfa;
}

.project-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.project-card__icon {
  width: 42px;
  height: 42px;
  font-size: 21px;
  color: var(--shell-accent);
  background: var(--shell-accent-soft);
  border-radius: 8px;
}

.project-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}

.project-card__name {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.45;
  color: var(--shell-text-primary);
}

.project-card__type {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  color: var(--shell-accent);
}

.project-card__hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--shell-text-secondary);
}

.project-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--shell-text-muted);
}

.project-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.project-card__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
}

.project-card__enter {
  flex: 1;
  min-width: 140px;
}

.project-card__create-icon {
  width: 46px;
  height: 46px;
  margin-bottom: 2px;
  font-size: 26px;
  color: var(--shell-accent);
  background: var(--shell-accent-soft);
  border-radius: 8px;
}

.project-card__create-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--shell-text-primary);
}

.project-card__create-desc {
  max-width: 230px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--shell-text-secondary);
  text-align: center;
}

.archived-collapse {
  border-top: 1px solid rgb(100 116 139 / 10%);
  border-bottom: 0;
}

.dialog-tip {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--shell-text-secondary);
}

@media (width <= 1100px) {
  .home-hero {
    grid-template-columns: 1fr;
  }

  .home-hero__panel {
    max-width: none;
  }

  .ops-strip {
    grid-template-columns: 1fr;
  }
}

@media (width <= 640px) {
  .project-home {
    gap: 14px;
  }

  .home-hero,
  .project-section {
    padding: 20px;
  }

  .home-hero__title {
    font-size: 26px;
  }

  .home-hero__desc {
    font-size: 14px;
  }

  .hero-metrics,
  .project-grid {
    grid-template-columns: 1fr;
  }

  .ops-item {
    grid-template-columns: 38px minmax(0, 1fr);
    padding: 16px;
  }
}
</style>
