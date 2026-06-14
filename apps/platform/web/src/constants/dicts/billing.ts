import type { DictItem } from "@/utils/dict";

/** 计费服务类型 */
export const billingServiceTypeDict: DictItem[] = [
  { label: "文章完成", value: "ARTICLE", type: "primary" },
  { label: "SERP", value: "SERP", type: "info" },
  { label: "LLM", value: "LLM", type: "success" },
  { label: "配图", value: "IMAGE", type: "warning" },
  { label: "RPA", value: "RPA", type: "danger" }
];
