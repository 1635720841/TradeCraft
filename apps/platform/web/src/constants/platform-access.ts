/**
 * 平台 Console 权限 UI 常量（Console 访问控制页专用）。
 * 租户侧权限目录与角色默认见 auth/me accessMeta。
 */

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

/** 平台运营可授予的权限 ID（与后端 PLATFORM_GRANTABLE_PERMISSION_IDS 对齐） */
export const PLATFORM_GRANTABLE_PERMISSION_IDS = [
  "console:tenant:list",
  "console:tenant:read",
  "console:tenant:create",
  "console:tenant:update",
  "console:menu:manage",
  "console:health:read",
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
    key: "health",
    label: "系统健康",
    match: id => id.startsWith("console:health:")
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
