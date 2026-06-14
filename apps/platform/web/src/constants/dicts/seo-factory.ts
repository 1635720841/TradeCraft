import type { DictItem } from "@/utils/dict";

/** 文章任务状态（与 Prisma JobStatus 一致） */
export const jobStatusDict: DictItem[] = [
  { value: "QUEUED", label: "排队中", type: "info" },
  { value: "RESEARCHING", label: "SERP 研究中", type: "primary" },
  { value: "DRAFTING", label: "撰写中", type: "primary" },
  { value: "LINKING", label: "内链处理", type: "primary" },
  { value: "ILLUSTRATING", label: "配图处理", type: "primary" },
  { value: "OPTIMIZING", label: "优化中", type: "warning" },
  { value: "REVIEWING", label: "内容审查", type: "warning" },
  { value: "COMPLETED", label: "已完成", type: "success" },
  { value: "FAILED", label: "失败", type: "danger" }
];

/** 轮询可停止的终态 */
export const JOB_TERMINAL_STATUSES = ["COMPLETED", "FAILED"] as const;

/** 内容输出语言（与后端 Site.contentLanguage / ArticleJob.contentLanguage 一致） */
export const CONTENT_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" }
] as const;

export type ContentLanguageCode = (typeof CONTENT_LANGUAGE_OPTIONS)[number]["value"];

/** YMYL 敏感分类（与后端 ymyl-detect.util categories 一致） */
export const ymylCategoryDict: DictItem[] = [
  { value: "medical", label: "医疗健康", type: "danger" },
  { value: "finance", label: "金融投资", type: "warning" },
  { value: "legal", label: "法律合规", type: "warning" },
  { value: "safety", label: "安全决策", type: "danger" }
];

/** 站点页面类型（与 Prisma SitePageType 一致） */
export const sitePageTypeDict: DictItem[] = [
  { value: "PRODUCT", label: "产品页", type: "success" },
  { value: "SERVICE", label: "服务页", type: "primary" },
  { value: "SOLUTION", label: "解决方案", type: "primary" },
  { value: "BLOG", label: "博客", type: "info" },
  { value: "PAGE", label: "普通页面", type: "info" }
];
