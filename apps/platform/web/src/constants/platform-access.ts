/**
 * 平台权限 UI 常量（与后端 permission.constants.ts 对齐）。
 */

/** 角色默认权限 ID */
export const ROLE_DEFAULT_PERMISSION_IDS: Record<string, string[]> = {
  ADMIN: [
    "org:profile:read",
    "org:profile:update",
    "org:member:list",
    "org:member:create",
    "org:member:update",
    "org:member:grant",
    "org:billing:read",
    "org:billing:manage",
    "project:create",
    "project:read",
    "project:update",
    "seo:job:create",
    "seo:job:read",
    "seo:keyword:manage",
    "seo:site:manage"
  ],
  PLATFORM_OPERATOR: [
    "console:tenant:list",
    "console:tenant:read",
    "console:tenant:create",
    "console:tenant:update",
    "console:audit:read"
  ],
  MEMBER: [
    "org:profile:read",
    "project:read",
    "seo:job:create",
    "seo:job:read"
  ]
};

/** 权限模块分组标签 */
export const PERMISSION_MODULE_LABELS: Record<string, string> = {
  org: "企业管理",
  console: "平台管理",
  project: "项目",
  seo: "SEO 工厂"
};

/** 企业管理模块内的权限分组（用于授权页展示） */
export const ORG_PERMISSION_SECTIONS: Array<{
  key: string;
  label: string;
  match: (id: string) => boolean;
}> = [
  {
    key: "profile",
    label: "企业资料",
    match: id => id.startsWith("org:profile:")
  },
  {
    key: "member",
    label: "成员管理",
    match: id => id.startsWith("org:member:")
  },
  {
    key: "billing",
    label: "订阅与配额",
    match: id => id.startsWith("org:billing:")
  }
];

/** 勾选「管理」时自动附带「查看」 */
export const PERMISSION_IMPLIES: Record<string, string[]> = {
  "org:billing:manage": ["org:billing:read"],
  "org:member:grant": ["org:member:list"],
  "org:member:create": ["org:member:list"],
  "org:member:update": ["org:member:list"],
  "org:profile:update": ["org:profile:read"],
  "console:tenant:create": ["console:tenant:list"],
  "console:tenant:update": ["console:tenant:list", "console:tenant:read"],
  "console:prompt:manage": ["console:prompt:read"]
};

/** 平台运营可授予的权限 ID（与后端 PLATFORM_GRANTABLE_PERMISSION_IDS 对齐） */
export const PLATFORM_GRANTABLE_PERMISSION_IDS = [
  "console:tenant:list",
  "console:tenant:read",
  "console:tenant:create",
  "console:tenant:update",
  "console:menu:manage",
  "console:prompt:read",
  "console:prompt:manage",
  "console:audit:read"
];

/** 平台运营模块内的权限分组 */
export const CONSOLE_PERMISSION_SECTIONS: Array<{
  key: string;
  label: string;
  match: (id: string) => boolean;
}> = [
  {
    key: "tenant",
    label: "租户管理",
    match: id => id.startsWith("console:tenant:")
  },
  {
    key: "menu",
    label: "访问控制",
    match: id => id.startsWith("console:menu:")
  },
  {
    key: "prompt",
    label: "Prompt 运营",
    match: id => id.startsWith("console:prompt:")
  },
  {
    key: "audit",
    label: "操作审计",
    match: id => id.startsWith("console:audit:")
  }
];
