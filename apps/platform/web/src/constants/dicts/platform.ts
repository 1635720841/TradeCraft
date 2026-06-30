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

/** 审计操作（与后端 AuditService action 一致） */
export const auditActionDict: DictItem[] = [
  { value: "auth.login", label: "用户登录", type: "info" },
  { value: "console.tenant.create", label: "创建租户", type: "primary" },
  { value: "console.tenant.update", label: "更新租户", type: "primary" },
  { value: "console.tenant.renew", label: "租户续期", type: "success" },
  { value: "console.tenant.quota-topup", label: "租户加购配额", type: "success" },
  { value: "console.menu.update", label: "菜单配置", type: "warning" },
  { value: "console.prompt.update", label: "Prompt 更新", type: "warning" },
  { value: "console.permission.grant", label: "平台权限授予", type: "warning" },
  { value: "org.member.create", label: "添加成员", type: "primary" },
  { value: "org.member.update", label: "编辑成员", type: "primary" },
  { value: "org.member.grant", label: "成员权限授予", type: "warning" },
  { value: "org.member.invite", label: "邀请成员", type: "primary" },
  { value: "org.member.disable", label: "禁用成员", type: "danger" },
  { value: "org.member.enable", label: "启用成员", type: "success" },
  { value: "org.member.delete", label: "删除成员", type: "danger" },
  { value: "org.member.invite_revoke", label: "撤销邀请", type: "warning" },
  { value: "org.profile.update", label: "企业资料更新", type: "primary" },
  { value: "project.create", label: "创建项目", type: "primary" },
  { value: "project.update", label: "更新项目", type: "primary" },
  { value: "project.archive", label: "归档项目", type: "info" },
  { value: "project.delete", label: "删除项目", type: "danger" },
  { value: "project.member.add", label: "添加项目成员", type: "primary" },
  { value: "project.member.update", label: "编辑项目成员", type: "primary" },
  { value: "project.member.remove", label: "移除项目成员", type: "danger" },
  { value: "project.member.grant", label: "项目成员授权", type: "warning" },
  { value: "project.access_request.approve", label: "批准项目访问申请", type: "success" },
  { value: "project.access_request.reject", label: "拒绝项目访问申请", type: "danger" },
  { value: "article_job.cms_publish", label: "CMS 发布", type: "primary" },
  { value: "article_job.brief_approve", label: "大纲确认", type: "success" },
  { value: "content_review.approve", label: "内容审核通过", type: "success" },
  { value: "content_review.reject", label: "内容审核驳回", type: "danger" }
];

/** 续费/升级申请类型（与 BillingChangeRequest.type 一致） */
export const billingChangeRequestTypeDict: DictItem[] = [
  { value: "RENEW", label: "续费", type: "primary" },
  { value: "UPGRADE", label: "升级", type: "success" },
  { value: "TOPUP", label: "加购", type: "warning" }
];

/** Console 队列（与 BullMQ queue name 一致） */
export const consoleQueueDict: DictItem[] = [
  { value: "seo-factory-article-job", label: "文章生成", type: "info" },
  { value: "seo-factory-playwright", label: "Semrush RPA", type: "warning" },
  { value: "seo-factory-gsc-sync", label: "GSC 同步", type: "primary" }
];

/** BullMQ 任务状态（waiting / active / delayed / failed） */
export const queueJobStateDict: DictItem[] = [
  { value: "waiting", label: "等待", type: "warning" },
  { value: "active", label: "执行中", type: "success" },
  { value: "delayed", label: "延迟", type: "info" },
  { value: "failed", label: "失败", type: "danger" },
  { value: "all", label: "等待+执行", type: "info" }
];
