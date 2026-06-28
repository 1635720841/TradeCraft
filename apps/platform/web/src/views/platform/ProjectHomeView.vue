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
            在这里统一管理不同市场、站点和品牌线的 SEO
            内容生产项目，让选题、关键词、文章任务和发布协作保持在同一个节奏里。
          </p>
          <div class="mw-home__actions">
            <button
              type="button"
              class="mw-home__btn mw-home__btn--primary"
              @click="openCreateDialog"
            >
              <HomeIcon name="plus" :size="16" />
              新建项目
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
              展示企业内全部项目，未开放或未加入的也会列出，便于了解还有哪些能力尚未开通。
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
              class="mw-home__btn mw-home__btn--primary"
              @click="openCreateDialog"
            >
              <HomeIcon name="plus" :size="16" />
              新建企业项目
            </button>
          </div>
        </div>

        <div v-if="displayProjects.length" class="mb-4 flex flex-wrap gap-2">
          <span class="mw-home__summary-tag mw-home__summary-tag--success">
            可使用 {{ projectSummary.usable }}
          </span>
          <span class="mw-home__summary-tag mw-home__summary-tag--warning">
            未开放 {{ projectSummary.notOpen }}
          </span>
          <span class="mw-home__summary-tag">未加入 {{ projectSummary.notMember }}</span>
          <span
            v-if="projectSummary.archived"
            class="mw-home__summary-tag mw-home__summary-tag--muted"
          >
            已归档 {{ projectSummary.archived }}
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
                  </span>
                </div>
              </div>
            </article>
          </template>

          <button
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
        </div>

        <p v-if="!loading && displayProjects.length === 0" class="mw-home__empty">
          暂无项目，可先创建企业项目或联系管理员开通。
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
  createProject,
  listProjects,
  type ProjectItem
} from "@/api/platform/project";
import { projectMyAccessStatusDict, projectStatusDict } from "@/constants/dicts/platform";
import { useUserStoreHook } from "@/store/modules/user";
import { dictLabel } from "@/utils/dict";
import { message } from "@/utils/message";
import { formatPeriodEnd } from "@/utils/period";
import HomeIcon from "./components/home/HomeIcon.vue";
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
const projects = ref<ProjectItem[]>([]);
const profile = ref<OrganizationProfile | null>(null);

const PROJECT_SORT_ORDER: Record<string, number> = {
  usable: 0,
  not_open: 1,
  not_member: 2,
  member_expired: 3,
  archived: 4
};

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

const activeProjects = computed(() =>
  projects.value.filter(item => item.status === "ACTIVE")
);

const displayProjects = computed(() =>
  [...projects.value].sort((a, b) => {
    const aOrder = PROJECT_SORT_ORDER[a.myAccessStatus ?? "not_member"] ?? 9;
    const bOrder = PROJECT_SORT_ORDER[b.myAccessStatus ?? "not_member"] ?? 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  })
);

const projectSummary = computed(() => {
  const summary = {
    usable: 0,
    notOpen: 0,
    notMember: 0,
    archived: 0
  };
  for (const item of projects.value) {
    if (item.myAccessStatus === "usable") summary.usable += 1;
    else if (item.myAccessStatus === "not_open") summary.notOpen += 1;
    else if (item.myAccessStatus === "not_member") summary.notMember += 1;
    else if (item.myAccessStatus === "archived" || item.status === "ARCHIVED") {
      summary.archived += 1;
    }
  }
  return summary;
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

function canEnter(project: ProjectItem) {
  return project.canEnter === true;
}

function accessHint(project: ProjectItem) {
  if (project.myAccessStatus === "archived" || project.status === "ARCHIVED") {
    return "项目已归档";
  }
  if (project.myAccessStatus === "not_open") return "项目未开放";
  if (project.myAccessStatus === "not_member") return "未加入该项目";
  if (project.myAccessStatus === "member_expired") return "访问已过期";
  if (project.status !== "ACTIVE") return "项目不可用";
  return "暂不可进入";
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
    const all: ProjectItem[] = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const result = await listProjects(page, limit);
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

function goOrganization() {
  router.push({ name: "OrgProfile" });
}

function goProjectManage() {
  router.push({ name: "OrgProjects" });
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
