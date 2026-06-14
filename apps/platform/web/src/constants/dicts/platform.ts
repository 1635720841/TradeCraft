import type { DictItem } from "@/utils/dict";

/** 项目状态（与 Prisma ProjectStatus 一致） */
export const projectStatusDict: DictItem[] = [
  { value: "ACTIVE", label: "进行中", type: "success" },
  { value: "ARCHIVED", label: "已归档", type: "info" }
];

/** 成员角色（与 Prisma Role 一致） */
export const memberRoleDict: DictItem[] = [
  { value: "ADMIN", label: "管理员", type: "danger" },
  { value: "MEMBER", label: "成员", type: "info" }
];

/** 企业套餐（展示用） */
export const planNameDict: DictItem[] = [
  { value: "trial", label: "试用版", type: "info" },
  { value: "standard", label: "标准版", type: "primary" },
  { value: "enterprise", label: "企业版", type: "success" }
];
