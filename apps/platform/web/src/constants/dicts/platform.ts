import type { DictItem } from "@/utils/dict";

/** 项目状态（与 Prisma ProjectStatus 一致） */
export const projectStatusDict: DictItem[] = [
  { value: "ACTIVE", label: "进行中", type: "success" },
  { value: "ARCHIVED", label: "已归档", type: "info" }
];

/** 成员角色（与 Prisma Role 一致） */
export const memberRoleDict: DictItem[] = [
  { value: "SUPER_ADMIN", label: "超级管理员", type: "warning" },
  { value: "PLATFORM_OPERATOR", label: "平台管理员", type: "primary" },
  {
    value: "ADMIN",
    label: "企业管理员",
    description: "管理本企业成员、项目与订阅",
    type: "danger"
  },
  {
    value: "MEMBER",
    label: "企业成员",
    description: "使用已加入的项目与功能",
    type: "info"
  }
];

/** 项目成员角色 */
export const projectMemberRoleDict: DictItem[] = [
  { value: "OWNER", label: "负责人", type: "danger" },
  { value: "EDITOR", label: "编辑者", type: "primary" },
  { value: "VIEWER", label: "查看者", type: "info" }
];

/** 我对项目的访问状态 */
export const projectMyAccessStatusDict: DictItem[] = [
  { value: "usable", label: "可使用", type: "success" },
  { value: "not_open", label: "未开放", type: "warning" },
  { value: "not_member", label: "未加入", type: "info" },
  { value: "member_expired", label: "访问过期", type: "danger" },
  { value: "archived", label: "已归档", type: "info" }
];

/** 订阅状态 */
export const subscriptionStatusDict: DictItem[] = [
  { value: "TRIAL", label: "试用中", type: "info" },
  { value: "ACTIVE", label: "生效中", type: "success" },
  { value: "EXPIRED", label: "已过期", type: "danger" },
  { value: "CANCELLED", label: "已取消", type: "warning" }
];

/** 企业状态 */
export const organizationStatusDict: DictItem[] = [
  { value: "ACTIVE", label: "正常", type: "success" },
  { value: "SUSPENDED", label: "已暂停", type: "warning" },
  { value: "CLOSED", label: "已关闭", type: "info" }
];

/** 计费周期 */
export const billingCycleDict: DictItem[] = [
  { value: "MONTHLY", label: "月付", type: "primary" },
  { value: "YEARLY", label: "年付", type: "success" }
];

/** 企业套餐（展示用） */
export const planNameDict: DictItem[] = [
  { value: "trial", label: "试用版", type: "info" },
  { value: "standard", label: "标准版", type: "primary" },
  { value: "enterprise", label: "企业版", type: "success" }
];
