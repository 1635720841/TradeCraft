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
  // 全屏403（无权访问）页面
  {
    path: "/access-denied",
    name: "AccessDenied",
    component: () => import("@/views/error/403.vue"),
    meta: {
      title: $t("menus.pureAccessDenied"),
      showLink: false
    }
  },
  // 全屏500（服务器出错）页面
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
  // seo-factory 插件页：放 remaining 避免被 formatTwoStageRoutes 拍平导致动态路由失效
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
        path: "/projects/:projectId/seo-factory/jobs",
        name: "SeoFactoryJobs",
        component: () =>
          import("@/views/projects/seo-factory/JobListView.vue"),
        meta: {
          title: "文章任务",
          roles: ["admin", "common"],
          showLink: false
        }
      },
      {
        path: "/projects/:projectId/seo-factory/jobs/create",
        name: "SeoFactoryJobCreate",
        component: () =>
          import("@/views/projects/seo-factory/JobCreateView.vue"),
        meta: {
          title: "新建任务",
          roles: ["admin", "common"],
          showLink: false
        }
      },
      {
        path: "/projects/:projectId/seo-factory/jobs/:jobId",
        name: "SeoFactoryJobDetail",
        component: () =>
          import("@/views/projects/seo-factory/JobDetailView.vue"),
        meta: {
          title: "任务详情",
          roles: ["admin", "common"],
          showLink: false
        }
      },
      {
        path: "/projects/:projectId/seo-factory/sites",
        name: "SeoFactorySites",
        component: () =>
          import("@/views/projects/seo-factory/SiteManageView.vue"),
        meta: {
          title: "站点管理",
          roles: ["admin", "common"],
          showLink: false
        }
      }
    ]
  }
] satisfies Array<RouteConfigsTable>;
