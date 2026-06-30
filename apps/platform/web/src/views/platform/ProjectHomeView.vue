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
      class="mw-home__production-section"
      aria-label="本月生产看板"
    >
      <article class="mw-home__production-card">
        <div class="mw-home__production-header">
          <h2>
            本月生产
            <span class="mw-home__section-sub">/ {{ production.periodLabel }}</span>
          </h2>
        </div>

        <div class="mw-home__production-body">
          <div class="mw-home__production-pipeline">
            <button
              v-for="tile in productionTiles"
              :key="tile.key"
              type="button"
              class="mw-home__production-stat"
              :class="`mw-home__production-stat--${tile.tone}`"
              :disabled="tile.count <= 0"
              @click="tile.onClick()"
            >
              <b>{{ tile.count }}</b>
              <span>{{ tile.label }}</span>
            </button>
          </div>

          <div
            v-if="production.myTodos.reviewPendingCount || production.myTodos.assignedCount"
            class="mw-home__production-todos"
          >
            <button
              v-if="production.myTodos.assignedCount"
              type="button"
              class="mw-home__production-stat mw-home__production-stat--warning"
              @click="goProductionAssigned"
            >
              <b>{{ production.myTodos.assignedCount }}</b>
              <span>指派给我</span>
            </button>
            <button
              v-if="production.myTodos.reviewPendingCount"
              type="button"
              class="mw-home__production-stat mw-home__production-stat--warning"
              @click="goProductionReview"
            >
              <b>{{ production.myTodos.reviewPendingCount }}</b>
              <span>等我审核</span>
            </button>
          </div>
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
            <p class="mw-home__workspace-desc">
              展示您可进入的项目；其余请前往「项目管理」。
            </p>
          </div>
          <div class="mw-home__workspace-actions">
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

        <div v-if="enterableProjects.length" class="mw-home__workspace-tags">
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
                <span
                  v-for="(member, index) in project.memberPreview ?? []"
                  :key="member.userId"
                  class="mw-home__member"
                  :style="{
                    ...memberAvatarStyle(member.userId),
                    zIndex: index + 1
                  }"
                  :title="memberDisplayName(member.name, member.email)"
                />
                <span class="mw-home__members-label">{{ project.memberCount }} 位成员</span>
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

          <button
            v-if="isAdmin && displayProjects.length"
            type="button"
            class="mw-home__project-item mw-home__new-project"
            @click="openCreateDialog"
          >
            <div>
              <div class="mw-home__new-plus" aria-hidden="true">
                <HomeIcon name="plus" :size="28" />
              </div>
              <b>新建企业项目</b>
              <p>为新的站点、品牌或国家市场创建独立内容生产线</p>
            </div>
          </button>

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

    <el-dialog
      v-model="createVisible"
      title="新建企业项目"
      width="480px"
      destroy-on-close
    >
      <p class="mw-home__dialog-tip">
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
        <el-button type="primary" :loading="creating" @click="submitCreate">
          创建并进入
        </el-button>
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
} from "@/api/org/organization";
import {
  createOrgProject,
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
import {
  memberAvatarTone,
  memberDisplayName
} from "@/utils/member-display";
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
const creating = ref(false);
const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const showOtherProjects = ref(false);
const applyingProjectId = ref<string | null>(null);
const projects = ref<OrgProjectItem[]>([]);
const profile = ref<OrganizationProfile | null>(null);
const production = ref<OrgProductionSummary | null>(null);
const productionLoading = ref(false);

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
      icon: "check" as const,
      tone: "success",
      count: t.completedJobs,
      onClick: () => pid && router.push(`${base}?status=COMPLETED`)
    },
    {
      key: "brief",
      label: "待确认大纲",
      icon: "brief" as const,
      tone: "blue",
      count: t.pendingBriefCount,
      onClick: () => pid && router.push(`${base}?stage=outlinePending`)
    },
    {
      key: "review",
      label: "待审核",
      icon: "review" as const,
      tone: "warning",
      count: t.pendingReviewCount,
      onClick: () => pid && router.push(`${base}?stage=reviewPending`)
    },
    {
      key: "publish",
      label: "待发布",
      icon: "publish" as const,
      tone: "blue",
      count: t.pendingPublishCount,
      onClick: () => pid && router.push(`${base}?cmsPublishPending=1`)
    },
    {
      key: "failed",
      label: "失败",
      icon: "alert" as const,
      tone: "danger",
      count: t.failedJobs,
      onClick: () => pid && router.push(`${base}?status=FAILED`)
    }
  ];
});

function goProductionJobs(query: Record<string, string>) {
  const pid = firstEnterableProject.value?.id;
  if (!pid) return;
  router.push({
    path: `/projects/${pid}/seo-factory/jobs`,
    query
  });
}

function goProductionAssigned() {
  goProductionJobs({ assignedToMe: "1" });
}

function goProductionReview() {
  goProductionJobs({ stage: "reviewPending" });
}

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

function memberAvatarStyle(userId: string) {
  const tone = memberAvatarTone(userId);
  return {
    background: tone.bg,
    boxShadow: `inset 0 -3px 6px ${tone.shadow}`
  };
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
      const project = await createOrgProject({
        name: createForm.name.trim(),
        projectType: createForm.projectType
      });
      message("企业项目创建成功", { type: "success" });
      createVisible.value = false;
      await Promise.all([fetchProjects(), loadProfile()]);
      if (project.projectType === "seo-factory" && project.canEnter) {
        enterProject(project);
      }
    } finally {
      creating.value = false;
    }
  });
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
