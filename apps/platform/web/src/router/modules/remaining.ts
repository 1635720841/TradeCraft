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
              title: "概览",
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "jobs",
            name: "SeoFactoryJobs",
            component: () => import("@/views/projects/seo-factory/JobListView.vue"),
            meta: {
              title: "任务",
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
                  title: "关键词池",
                  roles: ["admin", "common"],
                  showLink: false
                }
              },
              {
                path: "topic-clusters",
                name: "SeoFactoryTopicClusters",
                component: () => import("@/views/projects/seo-factory/TopicClusterView.vue"),
                meta: {
                  title: "主题集群",
                  roles: ["admin", "common"],
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
              roles: ["admin", "common"],
              showLink: false
            }
          },
          {
            path: "settings/score-lab",
            name: "SeoFactoryScoreLab",
            component: () =>
              import("@/views/projects/seo-factory/ScoreCalibrationLabView.vue"),
            meta: {
              title: "评分校准实验室",
              roles: ["admin"],
              showLink: false
            }
          },
          {
            path: "content-score",
            name: "SeoFactoryContentScore",
            component: () =>
              import("@/views/projects/seo-factory/ArticleContentScoreTrialView.vue"),
            meta: {
              title: "内容评分",
              roles: ["admin"],
              showLink: false
            }
          },
          {
            path: "settings/content-score-trial",
            redirect: (to) => ({
              name: "SeoFactoryContentScore",
              params: { projectId: to.params.projectId }
            })
          },
          {
            path: "settings",
            name: "SeoFactorySettings",
            component: () => import("@/views/projects/seo-factory/ProjectSettingsView.vue"),
            meta: {
              title: "设置",
              roles: ["admin"],
              showLink: false
            }
          },
          {
            path: "gsc",
            name: "SeoFactoryGsc",
            component: () => import("@/views/projects/seo-factory/GscRedirectView.vue"),
            meta: {
              title: "搜索表现",
              roles: ["admin"],
              showLink: false
            }
          },
          {
            path: "sites/admin",
            name: "SeoFactorySiteAdmin",
            redirect: "settings"
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
  }
] satisfies Array<RouteConfigsTable>;
