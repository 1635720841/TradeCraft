import type { DictItem } from "@/utils/dict";

/** 文章任务状态（与 Prisma JobStatus 一致） */
export const jobStatusDict: DictItem[] = [
  { value: "QUEUED", label: "排队中", type: "info" },
  { value: "RESEARCHING", label: "分析搜索结果", type: "primary" },
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
  { value: "en", label: "英文" },
  { value: "zh-CN", label: "简体中文" }
] as const;

export type ContentLanguageCode = (typeof CONTENT_LANGUAGE_OPTIONS)[number]["value"];

/** 文章内容形态（与 Prisma ArticleContentForm 一致） */
export const articleContentFormDict: DictItem[] = [
  {
    value: "ARTICLE",
    label: "博客长文",
    description: "常规深度文章，多段落讲解，适合大部分关键词",
    type: "primary"
  },
  {
    value: "PRODUCT_ENHANCED",
    label: "产品软文",
    description: "围绕产品卖点写，含参数对比与询盘引导，适合转化类词",
    type: "warning"
  },
  {
    value: "FAQ_PAGE",
    label: "问答页面",
    description: "一问一答结构，适合「怎么选」「多少钱」这类问题",
    type: "info"
  }
];

/** YMYL 敏感分类（与后端 ymyl-detect.util categories 一致） */
export const ymylCategoryDict: DictItem[] = [
  { value: "medical", label: "医疗健康", type: "danger" },
  { value: "finance", label: "金融投资", type: "warning" },
  { value: "legal", label: "法律合规", type: "warning" },
  { value: "safety", label: "安全决策", type: "danger" }
];

/** YMYL 人工审核状态 */
export const ymylHumanReviewStatusDict: DictItem[] = [
  { value: "pending", label: "待审核", type: "warning" },
  { value: "approved", label: "已通过", type: "success" },
  { value: "rejected", label: "已驳回", type: "danger" }
];

/** 关键词搜索意图（与 Prisma KeywordIntent 一致） */
export const keywordIntentDict: DictItem[] = [
  {
    value: "INFORMATIONAL",
    label: "了解知识",
    description: "读者想搞懂一个问题，适合写科普、教程、行业知识",
    type: "info"
  },
  {
    value: "COMMERCIAL",
    label: "对比选购",
    description: "读者在比较多家方案或产品，适合写选购指南、参数对比",
    type: "primary"
  },
  {
    value: "TRANSACTIONAL",
    label: "询价下单",
    description: "读者离联系或采购很近，适合突出报价、起订量与联系方式",
    type: "success"
  },
  {
    value: "BRAND",
    label: "搜我们品牌",
    description: "读者直接搜公司名或品牌，适合写公司实力、案例与信任背书",
    type: "warning"
  },
  {
    value: "COMPETITOR",
    label: "搜竞品名",
    description: "读者搜的是竞争对手，适合写客观对比、帮读者做选择",
    type: "danger"
  }
];

/** 关键词状态（与 Prisma KeywordStatus 一致） */
export const keywordStatusDict: DictItem[] = [
  { value: "PENDING", label: "待筛选", type: "info" },
  { value: "APPROVED", label: "已通过", type: "success" },
  { value: "USED", label: "已入队", type: "primary" },
  { value: "ARCHIVED", label: "已归档", type: "info" }
];

/** 关键词来源（与 Prisma KeywordSource 一致） */
export const keywordSourceDict: DictItem[] = [
  { value: "MANUAL", label: "手动", type: "info" },
  { value: "IMPORT", label: "批量导入", type: "primary" },
  { value: "AI_SEED", label: "AI 种子", type: "warning" }
];

/** 站点页面类型（与 Prisma SitePageType 一致） */
export const sitePageTypeDict: DictItem[] = [
  { value: "PRODUCT", label: "产品页", type: "success" },
  { value: "SERVICE", label: "服务页", type: "primary" },
  { value: "SOLUTION", label: "解决方案", type: "primary" },
  { value: "BLOG", label: "博客", type: "info" },
  { value: "PAGE", label: "普通页面", type: "info" }
];
