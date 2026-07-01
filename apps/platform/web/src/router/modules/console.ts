/**
 * Console 路由：运营概览 + 租户 + 系统管理（健康/GSC/Prompt/审计）+ 平台权限。
 */
const Layout = () => import("@/layout/index.vue");

const consoleOpsRoles = ["super_admin", "platform_operator"] as const;

export default {
  path: "/console",
  name: "Console",
  component: Layout,
  redirect: "/console/overview",
  meta: {
    icon: "ep:setting",
    title: "平台管理",
    rank: 3,
    roles: [...consoleOpsRoles]
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
        roles: [...consoleOpsRoles]
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
        roles: [...consoleOpsRoles]
      }
    },
    {
      path: "/console/sites",
      name: "ConsoleSites",
      component: () => import("@/views/console/ConsoleSiteOverviewView.vue"),
      meta: {
        title: "站点总览",
        menuKey: "console:sites",
        permission: "console:tenant:read",
        roles: [...consoleOpsRoles]
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
        roles: [...consoleOpsRoles]
      }
    },
    {
      path: "/console/system",
      name: "ConsoleSystem",
      component: () => import("@/views/console/ConsoleSystemLayout.vue"),
      redirect: "/console/health",
      meta: {
        title: "系统管理",
        icon: "ep:tools",
        roles: [...consoleOpsRoles]
      },
      children: [
        {
          path: "/console/audit",
          name: "ConsoleAudit",
          component: () => import("@/views/console/ConsoleAuditView.vue"),
          meta: {
            title: "操作审计",
            menuKey: "console:audit",
            permission: "console:audit:read",
            roles: [...consoleOpsRoles]
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
            roles: [...consoleOpsRoles]
          }
        },
        {
          path: "/console/gsc",
          name: "ConsoleGsc",
          component: () => import("@/views/console/ConsoleGscView.vue"),
          meta: {
            title: "GSC 平台授权",
            showLink: false,
            permission: "console:gsc:manage",
            roles: [...consoleOpsRoles]
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
            roles: [...consoleOpsRoles]
          }
        }
      ]
    },
    {
      path: "/console/labs",
      name: "ConsoleLabs",
      component: () => import("@/views/console/ConsoleLabsLayout.vue"),
      redirect: "/console/labs/diagnostics",
      meta: {
        title: "实验室",
        menuKey: "console:labs",
        permission: "console:tenant:read",
        roles: [...consoleOpsRoles]
      },
      children: [
        {
          path: "/console/labs/diagnostics",
          name: "ConsoleProjectDiagnostics",
          component: () => import("@/views/console/ConsoleProjectDiagnosticsView.vue"),
          meta: {
            title: "项目诊断",
            menuKey: "console:labs",
            permission: "console:tenant:read",
            roles: [...consoleOpsRoles],
            showLink: false
          }
        },
        {
          path: "/console/labs/score-calibration",
          name: "ConsoleScoreLab",
          component: () => import("@/views/console/ConsoleScoreLabView.vue"),
          meta: {
            title: "评分校准实验室",
            menuKey: "console:labs",
            permission: "console:tenant:read",
            roles: [...consoleOpsRoles],
            showLink: false
          }
        },
        {
          path: "/console/labs/content-score",
          name: "ConsoleContentScore",
          component: () => import("@/views/console/ConsoleContentScoreView.vue"),
          meta: {
            title: "内容评分",
            menuKey: "console:labs",
            permission: "console:tenant:read",
            roles: [...consoleOpsRoles],
            showLink: false
          }
        }
      ]
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
    }
  ]
} satisfies RouteConfigsTable;
