const Layout = () => import("@/layout/index.vue");

export default {
  path: "/console",
  name: "Console",
  component: Layout,
  redirect: "/console/overview",
  meta: {
    icon: "ep:setting",
    title: "平台管理",
    rank: 3,
    roles: ["super_admin", "platform_operator"]
  },
  children: [
    {
      path: "/console/overview",
      name: "ConsoleOverview",
      component: () => import("@/views/console/ConsoleOverviewView.vue"),
      meta: {
        title: "运营概览",
        menuKey: "console:overview",
        permission: "console:tenant:list",
        roles: ["super_admin", "platform_operator"]
      }
    },
    {
      path: "/console/tenants",
      name: "ConsoleTenants",
      component: () => import("@/views/console/ConsoleTenantsView.vue"),
      meta: {
        title: "租户管理",
        menuKey: "console:tenants",
        permission: "console:tenant:list",
        roles: ["super_admin", "platform_operator"]
      }
    },
    {
      path: "/console/tenants/:organizationId",
      name: "ConsoleTenantDetail",
      component: () => import("@/views/console/ConsoleTenantDetailView.vue"),
      meta: {
        title: "租户详情",
        showLink: false,
        permission: "console:tenant:read",
        roles: ["super_admin", "platform_operator"]
      }
    },
    {
      path: "/console/audit",
      name: "ConsoleAudit",
      component: () => import("@/views/console/ConsoleAuditView.vue"),
      meta: {
        title: "操作审计",
        menuKey: "console:audit",
        permission: "console:audit:read",
        roles: ["super_admin", "platform_operator"]
      }
    },
    {
      path: "/console/health",
      name: "ConsoleHealth",
      component: () => import("@/views/console/ConsoleHealthView.vue"),
      meta: {
        title: "系统健康",
        menuKey: "console:health",
        permission: "console:health:read",
        roles: ["super_admin", "platform_operator"]
      }
    },
    {
      path: "/console/prompts",
      name: "ConsolePrompts",
      component: () => import("@/views/console/PromptManageView.vue"),
      meta: {
        title: "Prompt 运营",
        menuKey: "console:prompts",
        permission: "console:prompt:read",
        roles: ["super_admin", "platform_operator"]
      }
    },
    {
      path: "/console/access",
      name: "ConsoleAccess",
      component: () => import("@/views/console/ConsoleAccessView.vue"),
      meta: {
        title: "平台权限",
        menuKey: "console:access",
        permission: "console:menu:manage",
        roles: ["super_admin"]
      }
    },
    {
      path: "/console/menus",
      redirect: "/console/access",
      meta: {
        title: "菜单管理",
        showLink: false
      }
    },
    {
      path: "/console/system",
      redirect: "/console/health",
      meta: {
        title: "系统管理",
        showLink: false
      }
    }
  ]
} satisfies RouteConfigsTable;
