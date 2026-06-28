import { storageLocal } from "@pureadmin/utils";
import { userKey, type DataInfo } from "@/utils/auth";
import { resolveOrgEntryPath } from "../utils";

const Layout = () => import("@/layout/index.vue");

export default {
  path: "/org",
  name: "Org",
  component: Layout,
  redirect: () => {
    const userInfo = storageLocal().getItem<DataInfo<number>>(userKey);
    return resolveOrgEntryPath(userInfo?.visibleMenuKeys);
  },
  meta: {
    icon: "ep:office-building",
    title: "企业管理",
    rank: 2,
    roles: ["admin", "common", "super_admin"]
  },
  children: [
    {
      path: "/org/overview",
      redirect: "/org/profile",
      meta: {
        showLink: false
      }
    },
    {
      path: "/org/profile",
      name: "OrgProfile",
      component: () => import("@/views/org/OrgProfileView.vue"),
      meta: {
        title: "企业资料",
        menuKey: "org:profile",
        permission: "org:profile:read",
        roles: ["admin", "common", "super_admin"]
      }
    },
    {
      path: "/org/members",
      name: "OrgMembers",
      component: () => import("@/views/org/OrgMembersView.vue"),
      meta: {
        title: "成员与权限",
        menuKey: "org:members",
        permission: "org:member:list",
        roles: ["admin", "super_admin"]
      }
    },
    {
      path: "/org/projects",
      name: "OrgProjects",
      component: () => import("@/views/org/OrgProjectsView.vue"),
      meta: {
        title: "项目管理",
        menuKey: "org:projects",
        permission: "project:read",
        roles: ["admin", "common", "super_admin"]
      }
    },
    {
      path: "/org/access",
      redirect: "/org/members",
      meta: {
        showLink: false
      }
    },
    {
      path: "/org/billing",
      name: "OrgBilling",
      component: () => import("@/views/org/OrgBillingView.vue"),
      meta: {
        title: "订阅与配额",
        menuKey: "org:billing",
        permission: "org:billing:read",
        roles: ["admin", "common", "super_admin"]
      }
    }
  ]
} satisfies RouteConfigsTable;
