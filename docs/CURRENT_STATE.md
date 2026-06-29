# 项目当前状态

> AI 跨对话必读：以本文件 + 仓库代码为准，不凭记忆。  
> 任务勾选见 `task.md`；架构细则见 `.cursor/skills/seo-saas-platform/`。

## 阶段

**Phase 4 进行中 — 运营链路（Brief / CMS / 批量 / 内链编辑 / 站点 Profile）已接入**

## 已完成

### 平台与基建

- [x] Monorepo（pnpm workspace）+ `packages/`（shared-core、platform-sdk、provider-interfaces）
- [x] NestJS API + Prisma + Core（guards、exceptions、logger、redis、queue、storage、**按 org 限流**）
- [x] Prisma migrations（含 `Site.settings`、`ArticleJob.searchIntent`）；部署用 `pnpm db:deploy`
- [x] 对象存储：`S3_BUCKET` 配置后走 S3/MinIO，否则 `.data/exports` 本地 fallback
- [x] E2E 冒烟：`e2e/article-job-smoke.test.mjs` + **`e2e/draft-edit.test.mjs`**
- [x] Auth、项目 CRUD、计费、组织配额、M12 Prompt 管理

### seo-factory 引擎（M1–M12 编排）

- [x] Serper → Brief → 初稿 → 内链 → 配图 → Semrush 优化 → QuillBot → YMYL → 导出 → 计费
- [x] **Brief 人工确认**：`Site.settings.requireBriefApproval` 开启后工作流在 Brief 后暂停；`PATCH/approve/regenerate` API
- [x] **搜索意图**：入队时写入 `ArticleJob.searchIntent`（关键词池 intent），驱动 Brief/Draft Prompt
- [x] **站点写作素材**：行业/认证/起订量/文末询盘引导 + **高级素材**（产品线、差异化卖点、目标客户、禁用词、案例），写入 `Site.settings.contentProfile`
- [x] M10 导出：单条 zip + **`POST .../batch/export`** 批量 zip（失败明细 `X-Export-Failures`）
- [x] 稿件手动编辑：TipTap 编辑器 + stale / history / rollback
- [x] **内链人工编辑**：`PATCH .../internal-links` + 重跑植入；支持增删链并同步 Markdown 正文

### SEO 评分校准 v3（2026-06-22）

- [x] 本地评分/校准快照带 `localScoreVersion=2`；旧规则快照不再与新规则混训
- [x] 回滚的 Semrush 候选快照从训练集排除
- [x] 校准模型升级 v3：Flesch 特征改为“距 Semrush 目标的对齐度”
- [x] 生产门控除 Holdout MAE 外，增加 Semrush ≥9 样本数与召回率门槛
- [x] 模型未就绪时，即使站点曾把本地阈值降到 75，也安全回退到本地 95 + Semrush 真检
- [x] Semrush 8.7+ 启用手术式改写，减少 8.7→7.x 的整篇重写回退
- [x] AI 正文全出口结构硬闸：初稿、整篇优化、near-miss 改写、人工 AI 改写、QuillBot 落库前统一修复；移除泄漏目录、恢复被压平 H2、修复 `##.`/行内标题、限制 H1/H2/H3、补齐块间空行、拆分 >65 词段落；RPA 粘贴前再次兜底
- [x] 评分实验室新增 Semrush 黑盒反推实验：8 类单变量对照、每稿 3 次中位数/标准差、节点漂移告警、交错执行顺序、富文本复制与侧栏原始证据留存

### CMS 发布

- [x] **WordPress**：`CmsPublishService` + 站点配置 + 单条/批量推送 + 列表发布状态
- [x] **Shopify**：Blog 文章 / **产品详情页** 推送 + Blog/Product 下拉 + Files 图片上传
- [x] **CMS 更新已发文章**：存在 `cmsPublish.postId` 时走 WordPress/Shopify PUT 更新
- [x] **推送失败筛选**：`GET .../article-jobs?cmsPublishFailed=1`
- [x] 前端 CMS UI 默认开启（`VITE_WORDPRESS_CMS_UI_ENABLED` 非 `false` 即显示）

### 企业体验简化包 P4-UX（2026-06-29）

- [x] **三档岗位预设**：执行 / 审核 / 只读（`project-permission-presets`）；审核 preset 含 `seo:job:create`；`content_editor` alias 兼容
- [x] **审核权限断言**：`assertSeoJobReview`（`seo:job:create` \| `seo:site:manage`）用于大纲确认与敏感审核 API
- [x] **项目成员授权 UI**：`OrgProjectsView` 岗位预设按钮 + 折叠「高级：自定义权限」；评分实验室路由需 `seo:site:manage`
- [x] **管理员自助加入**：可管理但未加入时显示「将自己加入项目」
- [x] **个人待办**：概览「指派给我 / 等我审核」；`stats/summary` 返回 `myAssignedCount` / `myReviewPendingCount` / `canReviewInProject`；任务列表 `?assignedToMe=1`
- [x] **通知增强**：审核岗收件（OWNER \| create \| site:manage）；邮件含 `WEB_APP_ORIGIN` 直达链接；指派任务发邮件；Webhook `article.brief_pending` / `article.assigned`
- [x] **任务详情 GSC 一行**：已发布且 GSC 有数据时展示展示/点击/平均排名（近 28 天）
- [x] **站点最少素材**：`siteHasWritingProfile` = 行业 +（产品线 **或** ≥1 条卖点）；概览/站点页文案同步

### 产品壳（前端）

- [x] **SEO 工作台左侧导航**：概览 / 任务 / 词库 / 站点 + 设置（admin）
- [x] **运营**：任务进度条、概览流水线 + **今日待办**、流程/名词说明、批量重新生成/推送/导出
- [x] **任务阶段筛选**：`?stage=outlinePending|reviewPending|generating|...` 合并原独立队列入口
- [x] **任务列表快捷操作**：待确认大纲（单行/批量确认）、敏感审核（行内通过/驳回）
- [x] 新建任务可选搜索意图；列表展示任务级 `searchIntent`
- [x] `KeywordPoolView` 关键词池（含意图字段、**主题集群**筛选与归入）
- [x] `TopicClusterView` 主题集群进度看板 + **整组批量入队**
- [x] `ProjectSettingsView`：CMS、页面库、大纲需确认、Google 搜索表现（原管理端 + GSC）
- [x] `SiteManageView`：运营向站点配置（域名、语气、公司卖点）
- [x] **稿件待处理**：`?staleDraft=1` 筛选 + 概览待办
- [x] **站点写作素材待办**：`sitesMissingProfileCount` + 概览提醒去填写公司卖点
- [x] `JobDetailView`：Trace/任务 ID 折叠至「高级信息」；「重新生成」统一文案
- [x] **GSC**：嵌入设置页（admin）；概览 GSC 待办仅 admin 可见；`/gsc` 重定向至设置 `#gsc`
- [x] **概览主题进度**：展示待写最多的 3 个主题集群进度条
- [x] **站点卖点筛选**：`?profile=missing` 高亮未填写作素材的站点
- [x] **关键词快捷筛选**：可入队 / 未分组（`?queueable=1`、`?unclustered=1`）
- [x] **按站点筛选**：任务列表支持 `?siteId=`，列表展示站点列
- [x] **GSC 定时同步**：`GSC_AUTO_SYNC_ENABLED=true` 时每日 4:00 BullMQ 拉取过期数据

### SEO 外贸优化 P0（2026-06-14）

- [x] **站点 Profile 扩展**：`productLines` / `differentiators` / `targetBuyerType` / `forbiddenTerms` / `caseHighlights`；`enrichBrandVoiceForPrompt` 补齐改写/种子生成路径
- [x] **发布前检查清单**：`JobDetailView` 完成任务后展示标题/Meta/内链/配图/YMYL/导出/CTA/CMS 检查项（`buildPrePublishChecklist`）
- [x] **GSC 改稿待办**：`stats/summary` 返回 `gscUnderperformingJobs`；概览「去改稿」链至任务详情 `?tab=draft`
- [x] **Brief FAQ + Snippet**：`seo_brief_v1` 增加 `faqCandidates` / `featuredSnippetTarget`；修复 Brief `{{serpContext}}` 渲染；大纲 UI 可编辑
- [x] **关键词同质化警告**：`GET .../sites/:siteId/keyword-conflicts`；入队返回 `warnings`；`JobCreateView` / `KeywordPoolView` 提交前提示

### SEO 外贸优化 P1 + 稳定性（2026-06-14）

- [x] **内容形态**：`ArticleJob.contentForm`（标准文 / 产品增强 / FAQ 页）；`JobCreateView` 选择；Brief/Draft Prompt 注入 `contentFormGuidelines`
- [x] **CTA UTM + Inquiry 导出**：站点 Profile `utmSource/Medium/Campaign`；导出 HTML 文末 Inquiry 块 + UTM 拼接（`utm_term=目标词`）
- [x] **页面库主关键词**：`SitePage.primaryKeyword`；`PATCH .../pages/:id`；内链匹配加权；按意图/形态过滤 PageType
- [x] **主题集群支柱页**：`KeywordCluster.pillarKeywordId`；`TopicClusterView` 编辑；Brief/Draft 注入 cluster 上下文
- [x] **FAQ JSON-LD**：导出时 `@graph` 合并 `Article` + `FAQPage`（从 Brief `faqCandidates` + 正文 `## FAQ` 解析答案）
- [x] **竞品 Playwright 回退**：`SCRAPER_COMPETITOR_BROWSER_ENABLED=true` 时 HTTP 失败/空正文尝试浏览器渲染
- [x] **Brief JSON 重试**：`chatJson` 解析失败自动重试一次（更严格 system prompt）
- [x] **竞品分析 Tab / refresh-serp / GSC 重优化 / parse-llm-json**：见上轮短中期项（`ArticleJobCompetitorPanel`、`POST refresh-serp`、`POST rerun-optimization`）

### 已废弃 / redirect 的旧入口

- `/brief-reviews`、`/reviews` → 任务列表 `?stage=outlinePending|reviewPending`
- `/content/*`、`/scheduling/*`、`/gsc`、`/sites/admin` → 新路径 redirect

## 未实现 / 进行中

| 项 | 说明 |
|----|------|
| 新功能测试 | 部分 E2E 依赖本地已完成任务，无任务时会 skip |
| GSC OAuth | 需配置 `GOOGLE_GSC_CLIENT_ID/SECRET/REDIRECT_URI` 与 `WEB_APP_ORIGIN`；定时同步需 `GSC_AUTO_SYNC_ENABLED=true` |
| P2 大包 | i18n / CRM 归因 / Technical SEO / 外链 / 协作 / S3 `outputUrl` / 本地 SEO 预检增强等见 `task.md` P2-001 |
| 竞品浏览器抓取 | 默认关闭；需 `SCRAPER_COMPETITOR_BROWSER_ENABLED=true` 且本机 Playwright 可用 |

## 工作流现状

```
SERP → Brief → [人工确认?] → 初稿 → 内链 → 配图 → Semrush → QuillBot → YMYL → 导出 → COMPLETED
```

| 扩展 | 说明 |
|------|------|
| Brief 暂停 | `requireBriefApproval=true` 时 `approvalStatus=pending`，续跑前须 approve |
| CMS 推送 | 完成后 `POST .../publish`；已推送可「更新 CMS 内容」；状态存 `seoCheckData.cmsPublish` |
| 内链编辑 | 植入后可 PATCH 链接元数据并重跑 M8 |

## 关键路径

| 能力 | 位置 |
|------|------|
| 开发任务清单 | `task.md` |
| Brief 确认 | `article-job-brief.service.ts`、`JobListView.vue?stage=outlinePending` |
| 搜索意图 | `constants/search-intent.ts`、`llm.service.ts` |
| 站点 Profile | `SiteManageView` →「公司卖点（AI 写作素材）」 |
| 内链编辑 | `article-job-internal-links.service.ts`、`ArticleJobInternalLinksPanel.vue` |
| CMS 发布/更新 | `cms-publish.service.ts`、`shopify-files.service.ts` |
| 批量导出 | `export.service.ts` → `buildBatchExportPackage` |
| 任务列表筛选 | `?stage=outlinePending|reviewPending|...`、`?briefPending=1`、`?reviewPending=1`、`?siteId=`、`?assignedToMe=1`、`?siteOwner=me` |
| 三档岗位预设 | `project-permission-presets.ts`、`OrgProjectsView.vue` 权限抽屉 |
| 个人待办统计 | `getProjectStats` → `myAssignedCount` / `myReviewPendingCount` |
| 任务 GSC 一行 | `gsc.service.ts` → `getJobPagePerformance`、`JobDetailView.vue` |
| 通知直达链接 | `notification-link.util.ts`（`WEB_APP_ORIGIN`） |
| 主题集群 | `keyword-cluster.service.ts`、`TopicClusterView.vue`（含 `POST .../create-jobs`） |
| GSC 搜索表现 | `gsc.service.ts`、`ProjectSettingsView.vue`（嵌入 GSC、自动同步） |
| GSC 偏弱改稿待办 | `gsc-underperform.util.ts`、`WorkbenchOverviewView.vue` |
| 发布前清单 | `draft-edit-preview.ts`、`ArticleJobDraftPublishChecklist.vue` |
| 关键词冲突检测 | `keyword-cannibalization.util.ts`、`GET .../keyword-conflicts` |
| 内容形态 / 支柱集群 | `constants/content-form.ts`、`TopicClusterView.vue`、`cluster-prompt-context.util.ts` |
| 导出 FAQ JSON-LD | `article-json-ld.util.ts`、`export.service.ts` |
| 竞品浏览器回退 | `competitor-browser.scraper.ts`（`SCRAPER_COMPETITOR_BROWSER_ENABLED`） |
| 前端功能开关 | `apps/platform/web/src/constants/feature-flags.ts` |
| 企业 UX Full Pack | 见下方 P5-ENTERPRISE |

### P5-ENTERPRISE 企业 UX Full Pack（2026-06-29）

- [x] **`seo:job:review` 独立权限**：审核与创建/发布分离；preset 执行/审核/只读；迁移 `20260629180000`
- [x] **创建项目 UX**：创建后「进入工作台」、checklist、访问期默认长期开放
- [x] **组织生产看板**：`GET /api/v1/org/production/summary` + `ProjectHomeView`
- [x] **配额预览**：`useArticleQuotaPreview`（JobCreate / KeywordPool / TopicCluster）
- [x] **审计**：CMS 发布 / 审核 / 大纲操作写审计；`OrgAuditView` 中文映射
- [x] **任务时间线**：`ArticleJobActivity` 模型/API + `ArticleJobActivityTimeline.vue`
- [x] **评论 @提及**：`article-job-collab` + `ArticleJobCollabPanel.vue`
- [x] **钉钉/飞书机器人**：`OrgRobotChannel` + `OrgProfileView` 配置
- [x] **通知偏好**：`UserNotificationPreference` API + 邮件发送前检查
- [x] **审核超时 24h 升级**：BullMQ `review-escalation`
- [x] **Webhook**：投递日志 UI、SSRF 防护、BullMQ 异步投递、`article.comment_added`
- [x] **顶栏搜索**：`SearchModal` 调用 `searchOrg`（≥2 字）
- [x] **成员禁用/启用**：`PATCH /org/members/:userId/status` + `OrgMembersView`
- [x] **技术债**：`expectedProjectType: seo-factory`、`afterCommit`、成员访问状态 UI
- [x] **UTM 归因 CSV**：`GET .../sites/:id/attribution-export` + `SiteManageView`
- [x] **站点负责人**：`Site.settings.ownerUserId` + `?siteOwner=me` 筛选

## 本地验证

```bash
pnpm docker:up
cd apps/platform/api && pnpm db:deploy && pnpm db:seed
pnpm dev:api
pnpm dev:web
```

## 文档维护约定

| 事件 | 动作 |
|------|------|
| 完成功能 | 更新本文件 + `task.md` 对应 `[x]` |
| 工作流变更 | 同步 `workflow-resume.ts` 与本节表格 |

*最后更新：2026-06-29（P5-ENTERPRISE 企业 UX Full Pack 全量落地）*
