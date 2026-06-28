const Layout = () => import("@/layout/index.vue");

export default {
  path: "/platform",
  name: "Platform",
  component: Layout,
  redirect: "/welcome",
  meta: {
    icon: "ep:folder-opened",
    title: "平台",
    rank: 1
  },
  children: [
    {
      path: "/platform/projects",
      name: "PlatformProjects",
      component: () => import("@/views/platform/ProjectHomeView.vue"),
      meta: {
        title: "项目列表",
        roles: ["admin", "common", "super_admin"],
        showLink: false
      }
    },
    {
      path: "/platform/projects/:projectId",
      name: "PlatformProjectDetail",
      component: () => import("@/views/platform/ProjectDetailView.vue"),
      meta: {
        title: "项目详情",
        roles: ["admin", "common", "super_admin"],
        showLink: false
      }
    },
    {
      path: "/platform/billing",
      redirect: "/org/billing",
      meta: { title: "用量统计", showLink: false }
    },
    {
      path: "/platform/organization",
      redirect: "/org/profile",
      meta: { title: "企业设置", showLink: false }
    },
    {
      path: "/platform/prompts",
      redirect: "/console/prompts",
      meta: { title: "Prompt 运营台", showLink: false }
    }
  ]
} satisfies RouteConfigsTable;
