import { $t } from "@/plugins/i18n";
const Layout = () => import("@/layout/index.vue");

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
    path: "/access-denied",
    name: "AccessDenied",
    component: () => import("@/views/error/403.vue"),
    meta: {
      title: $t("menus.pureAccessDenied"),
      showLink: false
    }
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
      showLink: false
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
              title: "工作台概览",
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "jobs",
            name: "SeoFactoryJobs",
            component: () => import("@/views/projects/seo-factory/JobListView.vue"),
            meta: {
              title: "文章任务",
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "keywords",
            name: "SeoFactoryKeywords",
            component: () => import("@/views/projects/seo-factory/KeywordPoolView.vue"),
            meta: {
              title: "关键词池",
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "jobs/create",
            name: "SeoFactoryJobCreate",
            component: () => import("@/views/projects/seo-factory/JobCreateView.vue"),
            meta: {
              title: "新建任务",
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "jobs/:jobId",
            name: "SeoFactoryJobDetail",
            component: () => import("@/views/projects/seo-factory/JobDetailView.vue"),
            meta: {
              title: "任务详情",
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "sites",
            name: "SeoFactorySites",
            component: () => import("@/views/projects/seo-factory/SiteManageView.vue"),
            meta: {
              title: "站点管理",
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "reviews",
            name: "SeoFactoryReviews",
            component: () => import("@/views/projects/seo-factory/ReviewQueueView.vue"),
            meta: {
              title: "待审核",
              roles: ["admin", "common"],
              showLink: false
            }
          }
        ]
      }
    ]
  }
] satisfies Array<RouteConfigsTable>;
