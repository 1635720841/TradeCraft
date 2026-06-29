<!--
  企业项目首页：展示当前企业下的内容生产项目，作为进入工作台的入口。
  边界：
  - 不负责：项目内部业务（由 project-type 插件页面处理）
  - 不负责：企业成员与配额管理（见 /org 企业管理）
-->
<template>
  <div class="mw-home">
    <section class="mw-home__grid-hero">
      <article v-loading="profileLoading" class="mw-home__hero-card">
        <div class="mw-home__hero-content">
          <div class="mw-home__hello">
            <HomeIcon name="wave" :size="18" class="mw-home__hello-icon" />
            欢迎回来，{{ displayName }}
          </div>
          <h1>{{ orgName }}</h1>
          <p>
            在这里浏览并进入你参与的内容生产项目，从选题、关键词到文章任务与发布协作，保持同一工作节奏。
          </p>
          <div class="mw-home__actions">
            <button
              v-if="isAdmin"
              type="button"
              class="mw-home__btn mw-home__btn--primary"
              @click="goProjectManage"
            >
              <HomeIcon name="settings" :size="16" />
              项目管理
            </button>
            <button
              type="button"
              class="mw-home__btn"
              :disabled="loading"
              @click="fetchProjects"
            >
              <HomeIcon name="refresh" :size="16" />
              刷新
            </button>
          </div>
        </div>
        <div class="mw-home__hero-illustration" aria-hidden="true">
          <img :src="heroIllustration" alt="" />
        </div>
      </article>

      <aside v-if="profile" class="mw-home__quota-card" aria-label="企业运营概览">
        <el-alert
          v-if="quotaLowAlert"
          class="mb-3"
          type="warning"
          :closable="false"
          show-icon
          :title="quotaLowAlert"
        />
        <div class="mw-home__quota-head">
          <span>本月内容配额</span>
          <span class="mw-home__badge" :class="quotaBadgeClass">{{
            quotaStatusText
          }}</span>
        </div>
        <div class="mw-home__quota-number">
          {{ profile.quota.remaining }}
          <small>/ {{ profile.quota.monthlyQuota }} 篇</small>
        </div>
        <div class="mw-home__progress" aria-hidden="true">
          <span :style="{ width: `${quotaPercent}%` }" />
        </div>
        <p class="mw-home__quota-note">
          已占用 {{ profile.quota.reservedTotal }} 篇（{{ quotaPercent }}%）
        </p>
        <p v-if="profile.currentPeriodEnd" class="mw-home__quota-note">
          企业有效至 {{ formatPeriodEnd(profile.currentPeriodEnd) }}
          <template v-if="profile.quota.daysRemaining != null">
            （剩余 {{ profile.quota.daysRemaining }} 天）
          </template>
        </p>
        <div class="mw-home__mini-stats">
          <div class="mw-home__mini">
            <b>{{ profile.projectCount }}</b>
            <span>项目线</span>
          </div>
          <div class="mw-home__mini">
            <b>{{ activeProjects.length }}</b>
            <span>运行中</span>
          </div>
          <div class="mw-home__mini">
            <b>{{ profile.memberCount }}</b>
            <span>协作成员</span>
          </div>
        </div>
        <div v-if="isAdmin" class="mw-home__quota-links">
          <button
            type="button"
            class="mw-home__quota-link"
            @click="goOrganization"
          >
            <HomeIcon name="settings" :size="14" />
            企业设置
          </button>
          <button type="button" class="mw-home__quota-link" @click="goBilling">
            <HomeIcon name="usage" :size="14" />
            用量统计
          </button>
        </div>
      </aside>
    </section>

    <SetupChecklistPanel
      v-if="orgSetupVisible"
      v-loading="orgSetupLoading"
      class="mw-home__setup-checklist"
      title="管理员首次配置"
      description="按顺序完成以下步骤，即可进入 SEO 工作台开始排产。"
      :items="orgSetupItems"
      dismissible
      @dismiss="orgSetupDismiss"
    />

    <section
      v-if="production"
      v-loading="productionLoading"
      class="mw-home__production-card"
      aria-label="本月生产看板"
    >
      <div class="mw-home__production-head">
        <h2>本月生产 · {{ production.periodLabel }}</h2>
        <span class="mw-home__production-quota">
          配额 {{ production.quota.remaining }} / {{ production.quota.periodQuota }} 篇
        </span>
      </div>
      <div class="mw-home__production-grid">
        <button
          v-for="tile in productionTiles"
          :key="tile.key"
          type="button"
          class="mw-home__production-tile"
          :disabled="tile.count <= 0"
          @click="tile.onClick()"
        >
          <b>{{ tile.count }}</b>
          <span>{{ tile.label }}</span>
        </button>
      </div>
      <p v-if="production.myTodos.reviewPendingCount || production.myTodos.assignedCount" class="mw-home__production-todos">
        <template v-if="production.myTodos.assignedCount">
          指派给我 {{ production.myTodos.assignedCount }} 项
        </template>
        <template v-if="production.myTodos.reviewPendingCount">
          <span v-if="production.myTodos.assignedCount"> · </span>
          等我审核 {{ production.myTodos.reviewPendingCount }} 项
        </template>
      </p>
    </section>

    <section class="mw-home__feature-grid" aria-label="项目运营重点">
      <article
        v-for="item in operationCards"
        :key="item.title"
        class="mw-home__feature-card"
      >
        <span class="mw-home__feature-icon">
          <HomeIcon :name="item.icon" :size="22" />
        </span>
        <div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </div>
      </article>
    </section>

    <section class="mw-home__workspace-section">
      <article class="mw-home__workspace-card">
        <div class="mw-home__workspace-header">
          <div>
            <h2>
              企业项目
              <span class="mw-home__section-sub">/ Project Workspace</span>
            </h2>
            <p>
              展示您可进入的项目；未开放或未加入的项目请前往「项目管理」查看。
            </p>
          </div>
          <div class="mw-home__workspace-actions">
            <button
              v-if="isAdmin"
              type="button"
              class="mw-home__btn"
              @click="goProjectManage"
            >
              <HomeIcon name="settings" :size="16" />
              项目管理
            </button>
            <button
              type="button"
              class="mw-home__btn"
              :disabled="loading"
              @click="fetchProjects"
            >
              <HomeIcon name="refresh" :size="16" />
              刷新
            </button>
          </div>
        </div>

        <div v-if="enterableProjects.length" class="mb-4 flex flex-wrap gap-2">
          <span class="mw-home__summary-tag mw-home__summary-tag--success">
            可进入 {{ enterableProjects.length }}
          </span>
          <span
            v-if="otherProjects.length"
            class="mw-home__summary-tag"
          >
            其他 {{ otherProjects.length }}
          </span>
        </div>

        <div v-loading="loading" class="mw-home__project-list">
          <template v-if="displayProjects.length">
            <article
              v-for="project in displayProjects"
              :key="project.id"
              class="mw-home__project-item"
              :class="{
                'mw-home__project-item--clickable': canEnter(project),
                'mw-home__project-item--muted': !canEnter(project)
              }"
              @click="canEnter(project) ? enterProject(project) : undefined"
            >
              <div class="mw-home__project-top">
                <span class="mw-home__project-logo" aria-hidden="true">
                  <HomeIcon name="seo" :size="22" />
                </span>
                <div class="mw-home__project-heading">
                  <h3>{{ project.name }}</h3>
                  <div class="mw-home__project-meta">
                    <span class="mw-home__project-link">{{
                      projectTypeLabel(project.projectType)
                    }}</span>
                    <span class="mw-home__status">{{
                      dictLabel(projectStatusDict, project.status)
                    }}</span>
                    <span
                      v-if="project.myAccessStatus"
                      class="mw-home__status"
                      :class="{
                        'mw-home__status--archived': project.myAccessStatus !== 'usable'
                      }"
                    >
                      {{ dictLabel(projectMyAccessStatusDict, project.myAccessStatus) }}
                    </span>
                  </div>
                </div>
              </div>
              <p class="mw-home__project-desc">
                {{ projectTypeHint(project.projectType) }}
              </p>
              <div v-if="project.memberCount" class="mw-home__members">
                <span class="mw-home__member" />
                <span class="mw-home__member" />
                <span class="mw-home__member" />
                <span class="mw-home__member" />
                <span>{{ project.memberCount }} 位成员</span>
              </div>
              <div class="mw-home__project-foot">
                <div class="mw-home__p-date">
                  <HomeIcon name="calendar" :size="14" />
                  {{
                    project.createdAt
                      ? formatDate(project.createdAt)
                      : "创建时间未知"
                  }}
                </div>
                <div class="mw-home__p-progress">
                  <button
                    v-if="canEnter(project)"
                    type="button"
                    class="mw-home__enter"
                    @click.stop="enterProject(project)"
                  >
                    进入工作台
                  </button>
                  <span v-else class="mw-home__access-hint">
                    {{ accessHint(project) }}
                    <button
                      v-if="isAdmin"
                      type="button"
                      class="mw-home__quota-link"
                      @click.stop="goProjectManage"
                    >
                      去项目管理
                    </button>
                    <template v-else>
                      <button
                        v-if="canApplyAccess(project)"
                        type="button"
                        class="mw-home__quota-link"
                        :disabled="applyingProjectId === project.id"
                        @click.stop="applyAccess(project)"
                      >
                        {{ applyingProjectId === project.id ? "提交中…" : "申请访问" }}
                      </button>
                      <span v-else> · 请联系企业管理员</span>
                    </template>
                  </span>
                </div>
              </div>
            </article>
          </template>

          <p
            v-if="!loading && otherProjects.length && !showOtherProjects"
            class="mw-home__empty"
          >
            <button type="button" class="mw-home__quota-link" @click="showOtherProjects = true">
              还有 {{ otherProjects.length }} 个项目暂不可进入，点击查看
            </button>
          </p>
        </div>

        <p v-if="!loading && displayProjects.length === 0" class="mw-home__empty">
          暂无可进入的项目。
          <template v-if="isAdmin">
            请前往
            <button type="button" class="mw-home__quota-link" @click="goProjectManage">
              项目管理
            </button>
            创建或开通访问。
          </template>
          <template v-else>请联系企业管理员开通项目访问。</template>
        </p>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  getOrganizationProfile,
  type OrganizationProfile
} from "@/api/org/organization";
import {
  listOrgProjects,
  type OrgProjectItem
} from "@/api/org/projects";
import { createProjectAccessRequest } from "@/api/org/access";
import {
  getOrgProductionSummary,
  type OrgProductionSummary
} from "@/api/org/production";
import { projectMyAccessStatusDict, projectStatusDict } from "@/constants/dicts/platform";
import { useUserStoreHook } from "@/store/modules/user";
import { dictLabel } from "@/utils/dict";
import { formatPeriodEnd } from "@/utils/period";
import { message } from "@/utils/message";
import HomeIcon from "./components/home/HomeIcon.vue";
import SetupChecklistPanel from "@/components/SetupChecklistPanel.vue";
import { useOrgAdminSetupChecklist } from "@/composables/useOrgAdminSetupChecklist";
import heroIllustration from "@/assets/img/0982809c-735d-484a-9681-f6e39a0140da.png";
import "./styles/merwise-home.css";

defineOptions({ name: "ProjectHomeView" });

const router = useRouter();
const userStore = useUserStoreHook();

const loading = ref(false);
const profileLoading = ref(false);
const showOtherProjects = ref(false);
const applyingProjectId = ref<string | null>(null);
const projects = ref<OrgProjectItem[]>([]);
const profile = ref<OrganizationProfile | null>(null);
const production = ref<OrgProductionSummary | null>(null);
const productionLoading = ref(false);

const operationCards = [
  {
    icon: "globe" as const,
    title: "多市场拆分",
    text: "按国家、语种和站点独立推进，避免不同市场的关键词与内容计划互相干扰。"
  },
  {
    icon: "workflow" as const,
    title: "流程集中",
    text: "把关键词池、SERP 分析、文章任务与发布检查收束到同一条工作流。"
  },
  {
    icon: "quality" as const,
    title: "质量可控",
    text: "持续关注配额、成员协作和项目状态，让内容生产保持稳定交付。"
  }
];

const isAdmin = computed(() => userStore.roles.includes("admin"));
const {
  visible: orgSetupVisible,
  loading: orgSetupLoading,
  items: orgSetupItems,
  dismiss: orgSetupDismiss
} = useOrgAdminSetupChecklist();

const orgName = computed(() => profile.value?.name || "我的企业");

const displayName = computed(
  () => userStore.nickname || userStore.username || "管理员"
);

const quotaPercent = computed(() => {
  const quota = profile.value?.quota;
  if (!quota || quota.monthlyQuota <= 0) return 0;
  return Math.min(
    100,
    Math.round((quota.reservedTotal / quota.monthlyQuota) * 100)
  );
});

const quotaStatusText = computed(() => {
  if (quotaPercent.value >= 90) return "即将用尽";
  if (quotaPercent.value >= 70) return "需要关注";
  return "余额充足";
});

const quotaBadgeClass = computed(() => ({
  "mw-home__badge--warning":
    quotaPercent.value >= 70 && quotaPercent.value < 90,
  "mw-home__badge--danger": quotaPercent.value >= 90
}));

const quotaLowAlert = computed(() => {
  const quota = profile.value?.quota;
  if (!quota || quota.subscriptionActive === false) return "";
  const total = quota.periodQuota || quota.monthlyQuota;
  if (total <= 0) return "";
  const remaining = quota.remaining;
  const percent = Math.round((remaining / total) * 100);
  if (remaining < 10 || percent < 20) {
    return `本月内容配额即将用尽（剩余 ${remaining} 篇，约 ${percent}%），请联系平台管理员续期或加购。`;
  }
  return "";
});

const activeProjects = computed(() =>
  projects.value.filter(item => item.status === "ACTIVE")
);

const enterableProjects = computed(() =>
  projects.value.filter(item => item.canEnter === true)
);

const otherProjects = computed(() =>
  projects.value.filter(item => item.canEnter !== true)
);

const displayProjects = computed(() => {
  const primary = enterableProjects.value;
  if (showOtherProjects.value) {
    return [...primary, ...otherProjects.value];
  }
  return primary.length > 0 ? primary : otherProjects.value;
});

const firstEnterableProject = computed(() => enterableProjects.value[0]);

const productionTiles = computed(() => {
  if (!production.value) return [];
  const t = production.value.totals;
  const pid = firstEnterableProject.value?.id;
  const base = pid ? `/projects/${pid}/seo-factory/jobs` : "";
  return [
    {
      key: "completed",
      label: "已完成",
      count: t.completedJobs,
      onClick: () => pid && router.push(`${base}?status=COMPLETED`)
    },
    {
      key: "brief",
      label: "待确认大纲",
      count: t.pendingBriefCount,
      onClick: () => pid && router.push(`${base}?stage=outlinePending`)
    },
    {
      key: "review",
      label: "待审核",
      count: t.pendingReviewCount,
      onClick: () => pid && router.push(`${base}?stage=reviewPending`)
    },
    {
      key: "publish",
      label: "待发布",
      count: t.pendingPublishCount,
      onClick: () => pid && router.push(`${base}?cmsPublishPending=1`)
    },
    {
      key: "failed",
      label: "失败",
      count: t.failedJobs,
      onClick: () => pid && router.push(`${base}?status=FAILED`)
    }
  ];
});

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN");
}

function canEnter(project: OrgProjectItem) {
  return project.canEnter === true;
}

function accessHint(project: OrgProjectItem) {
  if (project.myAccessStatus === "archived" || project.status === "ARCHIVED") {
    return "项目已归档";
  }
  if (project.myAccessStatus === "not_open") return "项目未开放";
  if (project.myAccessStatus === "not_member") return "未加入该项目";
  if (project.myAccessStatus === "member_expired") return "访问已过期";
  if (project.status !== "ACTIVE") return "项目不可用";
  return "暂不可进入";
}

function canApplyAccess(project: OrgProjectItem) {
  if (isAdmin.value || canEnter(project)) return false;
  if (project.status !== "ACTIVE") return false;
  return (
    project.myAccessStatus === "not_member" ||
    project.myAccessStatus === "member_expired"
  );
}

async function applyAccess(project: OrgProjectItem) {
  applyingProjectId.value = project.id;
  try {
    await createProjectAccessRequest(project.id);
    message("访问申请已提交，请等待管理员审批", { type: "success" });
  } catch {
    message("提交失败，请稍后重试", { type: "error" });
  } finally {
    applyingProjectId.value = null;
  }
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
    const all: OrgProjectItem[] = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const result = await listOrgProjects(page, limit);
      all.push(...result.items);
      const total = result.pagination.total ?? all.length;
      if (all.length >= total || result.items.length < limit) {
        break;
      }
      page += 1;
    }
    projects.value = all;
  } finally {
    loading.value = false;
  }
}

async function fetchProduction() {
  productionLoading.value = true;
  try {
    production.value = await getOrgProductionSummary();
  } catch {
    production.value = null;
  } finally {
    productionLoading.value = false;
  }
}

function goOrganization() {
  router.push({ name: "OrgProfile" });
}

function goProjectManage() {
  router.push({ name: "OrgProjects" });
}

function goBilling() {
  router.push({ name: "OrgBilling" });
}

function enterProject(row: OrgProjectItem) {
  router.push({ name: "SeoFactoryOverview", params: { projectId: row.id } });
}

onMounted(() => {
  void loadProfile();
  void fetchProjects();
  void fetchProduction();
});
</script>
