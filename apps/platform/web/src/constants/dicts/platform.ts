import type { DictItem } from "@/utils/dict";

/** 项目状态（与 Prisma ProjectStatus 一致） */
export const projectStatusDict: DictItem[] = [
  { value: "ACTIVE", label: "进行中", type: "success" },
  { value: "ARCHIVED", label: "已归档", type: "info" }
];
