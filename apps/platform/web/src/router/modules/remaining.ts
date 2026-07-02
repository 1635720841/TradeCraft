import { $t } from "@/plugins/i18n";
import {
  ensureProjectEnterable,
  ensureProjectRouteAccess,
  ensureProjectRouteAccessResult
} from "../guards/project-access";
import { storageLocal } from "@pureadmin/utils";
import { userKey } from "@/utils/auth";
import { resolveConsoleEntryPath, resolveOrgEntryPath } from "../utils";

const Layout = () => import("@/layout/index.vue");

function legacyOrgOrConsoleRedirect(orgPath: string) {
  const userInfo = storageLocal().getItem<{ roles?: string[]; visibleMenuKeys?: string[] }>(userKey);
  const roles = userInfo?.roles ?? [];
  if (roles.includes("platform_operator")) {
    return resolveConsoleEntryPath(userInfo?.visibleMenuKeys);
  }
  return orgPath;
}

export default [
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/login/index.vue"),
    meta: {
      title: $t("menus.pureLogin"),
      showLink: false
    }
  },
  {
    path: "/login/callback",
    name: "LogtoCallback",
    component: () => import("@/views/login/LogtoCallbackView.vue"),
    meta: {
      title: "Logto 登录",
      showLink: false
    }
  },
  {
    path: "/invite/accept",
    name: "InviteAccept",
    component: () => import("@/views/login/InviteAcceptView.vue"),
    meta: {
      title: "接受邀请",
      showLink: false
    }
  },
  {
    path: "/access-denied",
    redirect: "/error/403",
    meta: { title: $t("menus.pureAccessDenied"), showLink: false }
  },
  {
    path: "/platform/billing",
    redirect: () => legacyOrgOrConsoleRedirect("/org/billing"),
    meta: { title: "用量统计", showLink: false }
  },
  {
    path: "/platform/organization",
    redirect: () => legacyOrgOrConsoleRedirect("/org/profile"),
    meta: { title: "企业设置", showLink: false }
  },
  {
    path: "/platform/prompts",
    redirect: "/console/prompts",
    meta: { title: "Prompt 运营台", showLink: false }
  },
  {
    path: "/platform/tenants",
    redirect: "/console/tenants",
    meta: { title: "租户管理", showLink: false }
  },
  {
    path: "/platform/overview",
    redirect: "/console/overview",
    meta: { title: "运营概览", showLink: false }
  },
  {
    path: "/platform/audit",
    redirect: "/console/audit",
    meta: { title: "操作审计", showLink: false }
  },
  {
    path: "/platform/access",
    redirect: "/console/access",
    meta: { title: "访问控制", showLink: false }
  },
  {
    path: "/platform/menus",
    redirect: "/console/access",
    meta: { title: "菜单管理", showLink: false }
  },
  {
    path: "/platform/projects",
    redirect: () => {
      const userInfo = storageLocal().getItem<{ roles?: string[]; visibleMenuKeys?: string[] }>(userKey);
      const roles = userInfo?.roles ?? [];
      if (roles.includes("admin")) return "/org/projects";
      if (roles.includes("platform_operator") || roles.includes("super_admin")) {
        return resolveConsoleEntryPath(userInfo?.visibleMenuKeys);
      }
      return resolveOrgEntryPath(userInfo?.visibleMenuKeys);
    },
    meta: { title: "项目列表", showLink: false }
  },
  {
    path: "/platform/projects/:projectId",
    beforeEnter: async (to, _from, next) => {
      const projectId = Array.isArray(to.params.projectId)
        ? to.params.projectId[0]
        : to.params.projectId;
      if (!projectId) {
        next({ path: "/error/404" });
        return;
      }
      const canEnter = await ensureProjectEnterable(projectId);
      if (!canEnter) {
        next({ path: "/error/403", query: { projectId, reason: "project_access" } });
        return;
      }
      next({
        path: `/projects/${projectId}/seo-factory/overview`
      });
    },
    component: () => import("@/views/error/redirect-placeholder.vue"),
    meta: { title: "项目详情", showLink: false }
  },
  {
    path: "/server-error",
    name: "ServerError",
    component: () => import("@/views/error/500.vue"),
    meta: {
      title: $t("menus.pureServerError"),
      showLink: false
    }
  },
  {
    path: "/redirect",
    component: Layout,
    meta: {
      title: $t("status.pureLoad"),
      showLink: false
    },
    children: [
      {
        path: "/redirect/:path(.*)",
        name: "Redirect",
        component: () => import("@/layout/redirect.vue")
      }
    ]
  },
  {
    path: "/projects/:projectId/seo-factory",
    name: "SeoFactory",
    component: Layout,
    meta: {
      title: "SEO 工厂",
      showLink: false,
      fillViewport: true,
      hideFooter: true
    },
    beforeEnter: async (to) => {
      const result = await ensureProjectRouteAccessResult(to);
      if (result === "ok") return;
      const projectId = to.params.projectId;
      const id = Array.isArray(projectId) ? projectId[0] : projectId;
      const reason =
        result === "seo_permission"
          ? "seo_permission"
          : result === "workbench_not_ready"
            ? "workbench_not_ready"
            : "project_access";
      return { path: "/error/403", query: id ? { projectId: id, reason } : { reason } };
    },
    children: [
      {
        path: "",
        component: () => import("@/views/projects/seo-factory/SeoFactoryLayout.vue"),
        redirect: "/projects/:projectId/seo-factory/overview",
        children: [
          {
            path: "overview",
            name: "SeoFactoryOverview",
            component: () =>
              import("@/views/projects/seo-factory/WorkbenchOverviewView.vue"),
            meta: {
              title: "概览",
              seoPermission: "seo:job:read",
              showLink: false
            }
          },
          {
            path: "jobs",
            name: "SeoFactoryJobs",
            component: () => import("@/views/projects/seo-factory/JobListView.vue"),
            meta: {
              title: "任务",
              seoPermission: "seo:job:read",
              showLink: false
            }
          },
          {
            path: "jobs/create",
            name: "SeoFactoryJobCreate",
            component: () => import("@/views/projects/seo-factory/JobCreateView.vue"),
            meta: {
              title: "新建任务",
              seoPermission: "seo:job:create",
              showLink: false
            }
          },
          {
            path: "jobs/:jobId",
            name: "SeoFactoryJobDetail",
            component: () => import("@/views/projects/seo-factory/JobDetailView.vue"),
            meta: {
              title: "任务详情",
              seoPermission: "seo:job:read",
              showLink: false
            }
          },
          {
            path: "brief-reviews",
            redirect: "jobs?stage=outlinePending"
          },
          {
            path: "reviews",
            redirect: "jobs?stage=reviewPending"
          },
          {
            path: "keywords",
            component: () =>
              import("@/views/projects/seo-factory/components/KeywordSchedulingLayout.vue"),
            redirect: "pool",
            children: [
              {
                path: "pool",
                name: "SeoFactoryKeywords",
                component: () => import("@/views/projects/seo-factory/KeywordPoolView.vue"),
                meta: {
                  title: "选题",
                  seoPermission: "seo:job:read",
                  showLink: false
                }
              },
              {
                path: "topic-clusters",
                name: "SeoFactoryTopicClusters",
                component: () => import("@/views/projects/seo-factory/TopicClusterView.vue"),
                meta: {
                  title: "按主题",
                  seoPermission: "seo:job:read",
                  showLink: false
                }
              }
            ]
          },
          {
            path: "sites",
            name: "SeoFactorySites",
            component: () => import("@/views/projects/seo-factory/SiteManageView.vue"),
            meta: {
              title: "站点",
              seoPermission: "seo:job:read",
              showLink: false
            }
          },
          {
            path: "sites/:siteId",
            name: "SeoFactorySiteDetail",
            component: () => import("@/views/projects/seo-factory/SiteDetailView.vue"),
            meta: {
              title: "站点详情",
              seoPermission: "seo:job:read",
              showLink: false
            }
          },
          {
            path: "settings",
            name: "SeoFactorySettings",
            component: () => import("@/views/projects/seo-factory/ProjectSettingsView.vue"),
            meta: {
              title: "项目配置",
              seoPermission: "seo:site:manage",
              showLink: false
            }
          },
          {
            path: "gsc",
            name: "SeoFactoryGsc",
            component: () => import("@/views/projects/seo-factory/GscRedirectView.vue"),
            meta: {
              title: "搜索表现",
              seoPermission: "seo:job:read",
              showLink: false
            }
          },
          {
            path: "sites/admin",
            name: "SeoFactorySiteAdmin",
            redirect: "sites"
          },
          {
            path: "content/jobs",
            redirect: "jobs"
          },
          {
            path: "content/brief-reviews",
            redirect: "brief-reviews"
          },
          {
            path: "content/reviews",
            redirect: "reviews"
          },
          {
            path: "content",
            redirect: "jobs"
          },
          {
            path: "scheduling/keywords",
            redirect: "keywords/pool"
          },
          {
            path: "scheduling/topic-clusters",
            redirect: "keywords/topic-clusters"
          },
          {
            path: "scheduling",
            redirect: "keywords/pool"
          },
          {
            path: "sites/config",
            redirect: "sites"
          }
        ]
      }
    ]
  },
  {
    path: "/projects/:projectId/demo-factory",
    name: "DemoFactory",
    component: Layout,
    meta: {
      title: "演示插件",
      showLink: false,
      fillViewport: true,
      hideFooter: true
    },
    beforeEnter: async (to) => {
      const result = await ensureProjectRouteAccessResult(to);
      if (result === "ok") return;
      const projectId = to.params.projectId;
      const id = Array.isArray(projectId) ? projectId[0] : projectId;
      const reason =
        result === "workbench_not_ready"
          ? "workbench_not_ready"
          : "project_access";
      return { path: "/error/403", query: id ? { projectId: id, reason } : { reason } };
    },
    children: [
      {
        path: "",
        component: () => import("@/views/projects/demo-factory/DemoFactoryLayout.vue"),
        redirect: "/projects/:projectId/demo-factory/overview",
        children: [
          {
            path: "overview",
            name: "DemoFactoryOverview",
            component: () => import("@/views/projects/demo-factory/DemoOverviewView.vue"),
            meta: {
              title: "概览",
              showLink: false
            }
          }
        ]
      }
    ]
  }
] satisfies Array<RouteConfigsTable>;
