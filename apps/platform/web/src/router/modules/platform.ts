const Layout = () => import("@/layout/index.vue");

export default {
  path: "/platform",
  name: "Platform",
  component: Layout,
  redirect: "/platform/projects",
  meta: {
    icon: "ep:folder-opened",
    title: "平台",
    rank: 1
  },
  children: [
    {
      path: "/platform/projects",
      name: "PlatformProjects",
      component: () => import("@/views/platform/ProjectListView.vue"),
      meta: {
        title: "项目列表",
        roles: ["admin", "common"]
      }
    },
    {
      path: "/platform/projects/:projectId",
      name: "PlatformProjectDetail",
      component: () => import("@/views/platform/ProjectDetailView.vue"),
      meta: {
        title: "项目详情",
        roles: ["admin", "common"],
        showLink: false
      }
    },
    {
      path: "/platform/billing",
      name: "PlatformBilling",
      component: () => import("@/views/platform/BillingUsageView.vue"),
      meta: {
        title: "用量统计",
        roles: ["admin", "common"]
      }
    },
    {
      path: "/platform/prompts",
      name: "PlatformPrompts",
      component: () => import("@/views/platform/PromptManageView.vue"),
      meta: {
        title: "Prompt 运营台",
        roles: ["admin"]
      }
    },
    {
      path: "/platform/seo-jobs",
      name: "PlatformSeoJobs",
      redirect: "/projects/00000000-0000-4000-8000-000000000002/seo-factory/jobs",
      meta: {
        title: "SEO 文章任务",
        roles: ["admin", "common"]
      }
    }
  ]
} satisfies RouteConfigsTable;
