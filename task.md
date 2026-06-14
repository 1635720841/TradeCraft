# WM 项目开发任务清单

> 依据：[开发文档v2.md](开发文档v2.md)、[docs/文件/ai开发文档.md](docs/文件/ai开发文档.md)、[docs/CURRENT_STATE.md](docs/CURRENT_STATE.md)、`.cursor/skills/seo-saas-platform/`
>
> **用法**：AI 每次开工先读本文件 + `CURRENT_STATE.md`；完成任务后将 `[ ]` 改为 `[x]` 并同步 `CURRENT_STATE.md`。
>
> **原则**：克隆 `_template/` 不发明结构；热路径 >3s 走 BullMQ；外部 API 走 Provider；计费走事件。

---

## 进度总览

| Phase | 名称 | 状态 | 目标 |
|-------|------|------|------|
| P0 | 骨架搭建 | ✅ 已完成 | Monorepo、Schema、模板、前端壳 |
| P1 | 核心引擎验证 | ✅ 已完成 | SERP → Brief → 初稿（后端 + 入队） |
| P2 | 自动化攻坚 | 🟡 进行中 | Semrush、内链、配图、QuillBot 已接入；队列/browser 池待做 |
| P3 | SaaS 化基座 | 🟡 进行中 | Auth、多租户、项目 CRUD、工作台壳、站点/关键词/审核页已接入 |
| P4 | 资产完善与变现 | 🟡 进行中 | 导出、计费、Prompt、组织配额已完成；S3/E2E/WordPress UI 待做 |

---

## 任务状态说明

- `[x]` 已完成
- `[ ]` 待开发
- `[~]` 进行中（可选标记）
- **依赖**：必须先完成的任务 ID
- **验收**：完成判定标准
- **落位**：主要代码目录

---

## 模块 0 — 基础设施与工程化

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| INF-001 | Monorepo + pnpm workspace | [x] | P0 | — | 根目录 `pnpm-workspace.yaml` |
| INF-002 | Docker PostgreSQL + Redis 本地环境 | [x] | P0 | — | `docker-compose.yml`、`docs/SETUP.md` |
| INF-003 | 环境变量模板与校验 | [x] | P1 | — | `.env.example`、`apps/platform/api/.env` |
| INF-004 | CI：lint + typecheck + test | [x] | P3 | CORE-008 | `.github/workflows/` 或等效 |
| INF-005 | S3/对象存储接入配置 | [x] | P4 | — | `core/storage/s3-storage.service.ts`（`S3_BUCKET` 配置后启用，否则本地 fallback） |

### INF-003 验收
- [x] `.env.example` 覆盖 DATABASE_URL、REDIS_URL、各 Provider API Key
- [x] 启动时缺必填项有明确报错

### INF-004 验收
- [x] PR 触发 typecheck、单元测试
- [ ] 失败阻断合并（需 GitHub 分支保护配置）

---

## 模块 1 — 共享包 packages/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| PKG-001 | shared-core 基础类型与 RequestContext | [x] | P0 | — | `packages/shared-core/` |
| PKG-002 | platform-sdk IProjectTypePlugin 接口 | [x] | P0 | — | `packages/platform-sdk/` |
| PKG-003 | provider-interfaces 四大 Provider 接口 | [x] | P0 | — | `packages/provider-interfaces/` |
| PKG-004 | LLM 响应 JSON 清洗工具函数 | [x] | P1 | PKG-003 | `packages/shared-core/src/llm/` |
| PKG-005 | SERP 缓存 fingerprint 工具 | [x] | P1 | PKG-003 | `packages/shared-core/src/cache/` |

### PKG-004 验收
- [ ] 去除 Markdown ```json 包裹、首尾空白
- [ ] 解析失败抛结构化错误，附原始片段（脱敏）

### PKG-005 验收
- [ ] 相同 keyword + market + locale 生成稳定 fingerprint
- [ ] Redis key 格式：`serp:{orgId}:{projectId}:{fingerprint}`

---

## 模块 2 — 后端基建 core/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| CORE-001 | PrismaService + 全局 CoreModule | [x] | P0 | — | `core/database/`、`core/core.module.ts` |
| CORE-002 | LoggerService（traceId + orgId） | [x] | P0 | — | `core/logger/` |
| CORE-003 | BusinessException + 全局异常过滤器 | [x] | P0 | — | `core/exceptions/` |
| CORE-004 | RequestContext 类型定义 | [x] | P0 | — | `core/context/` |
| CORE-005 | Auth Guard + RequestContext 注入 | [x] | P3 | AUTH-002 | `core/guards/` |
| CORE-006 | EventBus（EventEmitter2）配置 | [x] | P1 | — | `core/event-bus/events.ts` |
| CORE-007 | Redis 连接模块 | [x] | P1 | INF-002 | `core/redis/` |
| CORE-008 | BullMQ 根模块与队列注册 | [x] | P1 | CORE-007 | `core/queue/` |
| CORE-009 | 全局 ValidationPipe + 响应拦截器 | [x] | P1 | — | `main.ts`（ValidationPipe 已有） |
| CORE-010 | 限流 Guard（按 orgId） | [x] | P3 | CORE-005 | `core/guards/rate-limit.guard.ts` |

### CORE-005 验收
- [ ] 每个受保护 API 可从 Guard 获取 `traceId`、`userId`、`organizationId`、`role`
- [ ] 禁止从 body/query 读取 `organizationId` 作权限依据

### CORE-006 验收
- [ ] 支持 `article.completed` 事件发布与订阅
- [ ] 事件在 DB 事务提交后发布

### CORE-008 验收
- [ ] 队列名前缀 `seo-factory:` 与 architecture 一致
- [ ] 支持重试、失败 dead-letter 记录

---

## 模块 3 — 平台层：认证 auth/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| AUTH-001 | Auth 模块骨架（module/controller/service） | [x] | P3 | — | `modules/auth/` |
| AUTH-002 | 对接 Logto 或 Supabase Auth | [x] | P3 | AUTH-001 | `modules/auth/logto/`（OIDC 回调 + 平台 JWT） |
| AUTH-003 | JWT/Session 校验中间件 | [x] | P3 | AUTH-002 | `modules/auth/` |
| AUTH-004 | 用户与 Organization 同步（首次登录建 org） | [x] | P3 | AUTH-002 | `modules/auth/`（syncUserFromLogto + ensureUserForEmail） |
| AUTH-005 | RBAC：ADMIN / MEMBER 权限装饰器 | [x] | P3 | AUTH-003 | `core/decorators/` |
| AUTH-006 | 前端登录对接真实 Auth（替换 Mock） | [x] | P3 | AUTH-002 | `web/src/views/login/`、`api/user.ts` |

### AUTH-002 验收
- [ ] 未登录请求返回 401，错误码来自 `error-codes.ts`
- [ ] 登录后 token 可换取 userId + organizationId

### AUTH-006 验收
- [ ] 移除「任意密码 Mock 登录」
- [ ] 401 自动跳转登录页

---

## 模块 4 — 平台层：项目 project/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| PROJ-001 | Project 模块骨架（CRUD 占位） | [x] | P0 | — | `modules/project/` |
| PROJ-002 | 创建项目（指定 projectType） | [x] | P3 | CORE-005 | `modules/project/` |
| PROJ-003 | 项目列表分页（orgId 隔离） | [x] | P3 | CORE-005 | `modules/project/` |
| PROJ-004 | 项目详情 / 归档 | [x] | P3 | PROJ-003 | `modules/project/` |
| PROJ-005 | projectType 注册表与插件路由 | [ ] | P3 | PLUGIN-001 | `modules/project/` |
| PROJ-006 | 前端项目列表完善（创建/切换） | [x] | P0 | PROJ-001 | `web/src/views/platform/ProjectListView.vue` |

### PROJ-002 验收
- [ ] `POST /api/v1/projects` 创建 seo-factory 类型项目
- [ ] 响应 `{ data, meta: { traceId } }`
- [ ] 双重隔离：仅本 org 可见

### PROJ-006 验收
- [ ] 支持创建项目、进入项目工作台路由
- [ ] 状态字典走 `constants/dicts/platform.ts`

---

## 模块 5 — 平台层：计费 billing/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| BILL-001 | Billing 模块骨架 | [x] | P4 | CORE-006 | `modules/billing/` |
| BILL-002 | CreditUsage 写入 Service | [x] | P4 | BILL-001 | `modules/billing/` |
| BILL-003 | 监听 `article.completed` 异步扣费 | [x] | P4 | BILL-002, WF-010 | `modules/billing/` |
| BILL-004 | 用量查询 API（按 org / 项目 / 时间） | [x] | P4 | BILL-002 | `modules/billing/` |
| BILL-005 | 配额检查（昂贵操作前） | [x] | P4 | BILL-002 | `modules/billing/`（`assertArticleQuota`，创建/批量任务） |
| BILL-006 | 前端用量/账单页 | [x] | P4 | BILL-004 | `web/src/views/platform/` |

### BILL-003 验收
- [x] 主流程 M10 不直接调用扣费，仅发事件
- [ ] 计费记录含 serviceType、provider、tokensOrCount、traceId
- [ ] 同 traceId 幂等，不重复扣费

---

## 模块 6 — seo-factory 插件：注册与骨架

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| PLUGIN-001 | seo-factory.plugin 实现 IProjectTypePlugin | [x] | P0 | PKG-002 | `project-types/seo-factory/` |
| PLUGIN-002 | seo-factory.module 聚合子模块 | [x] | P0 | PLUGIN-001 | `seo-factory.module.ts` |
| PLUGIN-003 | 插件路由前缀 `/api/v1/projects/:projectId/seo-factory/` | [ ] | P1 | CORE-005 | 各 Controller |

### PLUGIN-003 验收
- [ ] 所有插件 API 强制校验 projectId + organizationId
- [ ] projectType 非 seo-factory 时返回 404

---

## 模块 7 — seo-factory：站点 site/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| SITE-001 | Site 模块（列表 + CRUD API） | [x] | P3 | CORE-005, PLUGIN-003 | `modules/site/` |
| SITE-002 | Site DTO + Response 映射 | [x] | P3 | SITE-001 | `modules/site/dto/` |
| SITE-003 | 前端站点管理页 | [x] | P3 | SITE-001 | `SiteManageView.vue` |
| SITE-004 | WordPress CMS 配置（站点 REST 凭证） | [x] | P4 | SITE-001 | `site-cms.util.ts`（**后端**；前端 UI 见 CMS-002） |

### SITE-001 验收
- [ ] 字段：domain、brandVoice、targetMarket
- [ ] 列表分页，带 orgId + projectId 双重校验
- [ ] 错误码注册到 `error-codes.ts`

---

## 模块 8 — seo-factory：文章任务 article-job/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| JOB-001 | ArticleJob 模块骨架（创建/查询占位） | [x] | P0 | — | `modules/article-job/` |
| JOB-002 | 创建任务 API（202 + QUEUED） | [x] | P1 | CORE-008, JOB-001 | `modules/article-job/` |
| JOB-003 | 任务列表分页 API | [x] | P1 | JOB-001 | `modules/article-job/` |
| JOB-004 | 任务详情 API（不含大字段） | [x] | P1 | JOB-001 | `modules/article-job/` |
| JOB-005 | 创建时生成 traceId、写入 DB、入 BullMQ | [x] | P1 | JOB-002, QUEUE-002 | `modules/article-job/` |
| JOB-006 | 状态机更新（QUEUED → … → COMPLETED/FAILED） | [x] | P1 | WF-001 | `modules/workflow/` |
| JOB-007 | 租户隔离单元测试 | [x] | P1 | JOB-003 | `scripts/tenant-isolation.test.mjs` |

### JOB-002 验收
- [ ] `POST` 返回 HTTP 202，body 含 jobId、status=QUEUED、traceId
- [ ] Controller 同步路径不调用 LLM/SERP/Playwright

### JOB-007 验收
- [x] 跨 orgId 查询返回 404
- [x] 跨 projectId 查询返回 404

---

## 模块 9 — seo-factory：队列 processors/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| QUEUE-001 | article-job Processor 骨架 | [x] | P1 | CORE-008 | `processors/article-job.processor.ts` |
| QUEUE-002 | Processor 调用 WorkflowService 编排 | [x] | P1 | QUEUE-001, WF-001 | `processors/` |
| QUEUE-003 | 失败重试策略与 FAILED 状态回写 | [x] | P1 | QUEUE-002 | `processors/` |
| QUEUE-004 | 并发控制与速率限制 | [ ] | P2 | QUEUE-002 | `core/queue/` |
| QUEUE-005 | Playwright 专用队列（低频限速） | [x] | P2 | SEO-001 | `playwright-queue.module.ts`、`semrush-queue.service.ts` |

### QUEUE-003 验收
- [ ] 外部 API 超时不崩溃主进程
- [ ] 重试耗尽后 status=FAILED，日志含 traceId

---

## 模块 10 — seo-factory：工作流 workflow/（M1-M10 编排）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| WF-001 | WorkflowService 编排器骨架 | [x] | P1 | — | `modules/workflow/` |
| WF-002 | M1-M3：调用 ScraperService（SERP 研究） | [x] | P1 | WF-001, SERP-003 | `modules/workflow/` |
| WF-003 | M4：Brief 生成 | [x] | P1 | WF-002, LLM-003 | `modules/workflow/` |
| WF-004 | M5：正文初稿生成 | [x] | P1 | WF-003, LLM-004 | `modules/workflow/` |
| WF-005 | M6：Semrush 循环优化（≥9.0） | [x] | P2 | WF-004, SEO-003 | `modules/workflow/` |
| WF-006 | M7：YMYL 敏感内容标记 requires_human_review | [x] | P2 | WF-004 | `modules/content-review/` |
| WF-006b | QuillBot 润色（paraphrasing 步骤，M6 与 YMYL 之间） | [x] | P2 | WF-005 | `modules/paraphrase/` |
| WF-007 | M8：内链植入 | [x] | P2 | WF-005 | `modules/workflow/` |
| WF-008 | M9：配图生成 | [x] | P4 | WF-007, IMG-003 | `modules/workflow/` |
| WF-009 | M10：HTML/JSON-LD 打包上传 S3 | [~] | P4 | WF-008, EXP-002 | `modules/workflow/`（本地存储已接，S3 待接） |
| WF-010 | 完成时发布 `article.completed` 事件 | [x] | P4 | WF-009, CORE-006 | `modules/workflow/` |

### WF-001 验收
- [ ] 编排器只调度，不直接 axios 外部 API
- [ ] 每步更新 ArticleJob.status 与 JSONB 字段
- [ ] 日志全链路 traceId

### WF-005 验收
- [ ] semrushScore < 9.5 时循环调用 LLM 优化
- [ ] 达到 9.5 或最大重试次数后退出

### WF-006 验收
- [ ] YMYL 内容标记 `requires_human_review: true`
- [ ] 禁止直接输出可发布 HTML

---

## 模块 11 — seo-factory：抓取 scraper/ + Serper Provider（M1-M3）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| SCRAPER-001 | Scraper 模块骨架 | [x] | P1 | — | `modules/scraper/` |
| SCRAPER-002 | 竞品页面抓取（受控并发） | [x] | P2 | SCRAPER-001 | `competitor-page.scraper.ts` |
| SERP-001 | Serper Provider 适配器（克隆 _template） | [x] | P1 | PKG-003 | `providers/serper/` |
| SERP-002 | Serper Redis 24h 防御性缓存 | [x] | P1 | SERP-001, CORE-007 | `providers/serper/` |
| SERP-003 | ScraperService 对接 ISerpProvider | [x] | P1 | SCRAPER-001, SERP-002 | `modules/scraper/` |
| SERP-004 | SERP 结果写入 ArticleJob.serpData | [x] | P1 | SERP-003, WF-002 | `modules/scraper/` |

### SERP-001 验收
- [ ] 实现 `ISerpProvider.fetchSerp()`
- [ ] 返回 AI Overview、PAA、有机结果结构
- [ ] API Key 来自环境变量

### SERP-002 验收
- [ ] 缓存命中时不发起真实请求
- [ ] 日志记录 cache hit/miss

---

## 模块 12 — seo-factory：大模型 llm/ + DeepSeek Provider（M4-M5）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| LLM-001 | LLM 模块骨架 | [x] | P1 | — | `modules/llm/` |
| LLM-002 | DeepSeek Provider 适配器 | [x] | P1 | PKG-003 | `providers/deepseek/` |
| LLM-003 | generateBrief（Structured Output） | [x] | P1 | LLM-001, LLM-002 | `modules/llm/` |
| LLM-004 | generateDraft 正文初稿 | [x] | P1 | LLM-003 | `modules/llm/` |
| LLM-005 | generateOptimize 循环优化稿（M6 用） | [x] | P2 | LLM-004 | `modules/llm/` |
| LLM-006 | JSON 清洗 + 解析失败处理 | [x] | P1 | PKG-004, LLM-002 | `providers/deepseek/` |
| PROMPT-001 | Prompt 外置：seo_brief_v1.md | [x] | P1 | — | `prompts/seo_brief_v1.md` |
| PROMPT-002 | Prompt 外置：seo_draft_v1.md | [x] | P1 | — | `prompts/seo_draft_v1.md` |
| PROMPT-003 | 调用时记录 prompt_version | [x] | P1 | PROMPT-001 | `modules/llm/` |

### LLM-002 验收
- [ ] 实现 `ILLMProvider` 接口
- [ ] 开启 Structured Outputs
- [ ] 超时 180s，失败抛 BusinessException

### PROMPT-001 验收
- [ ] Prompt 不在 TypeScript 中硬编码长字符串
- [ ] 模板支持变量占位（keyword、serp、brandVoice）

---

## 模块 13 — seo-factory：SEO 查分 seo-checker/（M6）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| SEO-001 | seo-checker 模块骨架 | [x] | P2 | — | `modules/seo-checker/` |
| SEO-002 | Playwright + stealth Semrush RPA 适配器 | [x] | P2 | PKG-003 | `providers/semrush/` |
| SEO-003 | checkScore 实现与 Cookie 注入 | [x] | P2 | SEO-002 | `providers/semrush/` |
| SEO-004 | 浏览器池管理与资源释放 | [x] | P2 | SEO-002 | `semrush-browser-pool.ts` |
| SEO-005 | 查分结果写入 ArticleJob.semrushScore | [x] | P2 | SEO-003, WF-005 | `modules/seo-checker/` |
| SEO-006 | 低频限速与风控策略 | [x] | P2 | QUEUE-005 | `playwright-queue.config.ts`（concurrency=1 + limiter） |

### SEO-002 验收
- [ ] 实现 `ISeoCheckerProvider.checkScore()`
- [ ] 超时 120s，用完 close 浏览器
- [ ] 凭证来自环境变量，日志脱敏

---

## 模块 14 — seo-factory：内链 linking/（M8）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| LINK-001 | 内链模块骨架 | [x] | P2 | — | `modules/linking/` |
| LINK-002 | 本地页面库数据模型与导入 | [x] | P2 | LINK-001 | `prisma/schema.prisma` |
| LINK-003 | 文本向量匹配算法 | [~] | P2 | LINK-002 | `modules/linking/link-match.util.ts` |
| LINK-004 | 自然内链植入逻辑 | [x] | P2 | LINK-003, WF-007 | `modules/linking/` |

### LINK-004 验收
- [ ] 内链锚文本自然，不堆砌
- [ ] 仅链接同站点/同项目已索引页面

---

## 模块 15 — seo-factory：导出 export/ + BFL Provider（M9-M10）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| EXP-001 | export 模块骨架 | [x] | P4 | — | `modules/export/` |
| EXP-002 | HTML 语义化打包（无内联 CSS/JS） | [x] | P4 | EXP-001 | `modules/export/` |
| EXP-003 | JSON-LD Schema 生成 | [x] | P4 | EXP-002 | `modules/export/` |
| EXP-004 | 上传 S3，回写 ArticleJob.outputUrl | [~] | P4 | EXP-002, INF-005 | `modules/export/`（导出走 StorageService，S3 已接；outputUrl 仍为 API 下载路径） |
| EXP-005 | zip 资产包下载（HTML + images/ + meta.txt） | [x] | P4 | EXP-002 | `export-package.util.ts`、`GET .../export/package` |
| IMG-001 | BFL 官方生图 Provider 适配器 | [x] | P4 | PKG-003 | `providers/bfl/` |
| IMG-002 | 封面 + 插图生成与 Alt 标签 | [~] | P4 | IMG-001 | `modules/illustration/` |
| IMG-003 | export 模块对接 IImageProvider | [ ] | P4 | IMG-002, WF-008 | `modules/export/` |

### EXP-002 验收
- [ ] 输出纯净 HTML，不污染租户 WordPress/SaaS 全局样式
- [ ] YMYL 且 requires_human_review 时不生成可发布 HTML

### IMG-001 验收
- [x] 实现 `IImageProvider.generateImage()`（BFL 官方 `api.bfl.ai`）
- [ ] 单图成本可控，失败可降级（仅无图发布）

---

## 模块 16 — Prompt 版本库（M12）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| PROMPT-010 | PromptTemplate Prisma 模型 | [x] | P4 | — | `prisma/schema.prisma` |
| PROMPT-011 | Prompt 管理 CRUD API | [x] | P4 | PROMPT-010 | `modules/prompt/` |
| PROMPT-012 | LLM 模块从 DB 加载模板（热更新） | [x] | P4 | PROMPT-011 | `modules/llm/` |
| PROMPT-013 | Prompt Redis 缓存 1h | [x] | P4 | PROMPT-012 | `modules/prompt/` |
| PROMPT-014 | 前端 Prompt 版本管理页（ADMIN） | [x] | P4 | PROMPT-011 | `web/src/views/platform/` |

### PROMPT-012 验收
- [ ] 支持 A/B：按 prompt_version 回溯
- [ ] 禁止回退到 TS 硬编码

---

## 模块 17 — 前端：平台层 web/platform/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| FE-P-001 | pure-admin 壳接入 monorepo | [x] | P0 | — | `apps/platform/web/` |
| FE-P-002 | 项目列表页（真实 API） | [x] | P0 | PROJ-001 | `views/platform/ProjectListView.vue` |
| FE-P-003 | 项目创建对话框 | [x] | P3 | PROJ-002 | `views/platform/` |
| FE-P-004 | 平台 API 客户端规范 | [~] | P0 | — | `api/platform/` |
| FE-P-005 | 用量/账单页 | [x] | P4 | BILL-006 | `views/platform/` |
| FE-P-006 | HTTP 错误统一展示 error.message | [x] | P1 | — | `utils/http/` |

### FE-P-006 验收
- [ ] 4xx/5xx 走 ElMessage 展示后端 `error.message`
- [ ] 401 跳转登录

---

## 模块 18 — 前端：seo-factory 插件页 web/projects/seo-factory/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| FE-S-001 | seo-factory 路由模块 | [x] | P3 | PLUGIN-003 | `router/modules/seo-factory.ts` |
| FE-S-002 | 字典 jobStatusDict | [x] | P1 | — | `constants/dicts/seo-factory.ts` |
| FE-S-003 | article-job API 封装 | [x] | P1 | JOB-002 | `api/seo-factory/article-job.ts` |
| FE-S-004 | 任务创建页 | [x] | P3 | FE-S-003, SITE-001 | `JobCreateView.vue` |
| FE-S-005 | 任务列表页（分页 + 状态标签） | [x] | P3 | FE-S-003 | `JobListView.vue` |
| FE-S-006 | 任务详情页（轮询状态） | [x] | P3 | FE-S-003, JOB-004 | `JobDetailView.vue` |
| FE-S-007 | 站点管理页 | [x] | P3 | SITE-003 | `SiteManageView.vue` |
| FE-S-008 | composable：useArticleJobPolling | [x] | P3 | FE-S-006 | `composables/seo-factory/` |
| FE-S-009 | 工作台 Tab 壳（概览/任务/关键词/站点/审核） | [x] | P3 | FE-S-001 | `SeoFactoryWorkbenchShell.vue`、`remaining.ts` |
| FE-S-010 | 关键词池页 | [x] | P3 | KW-001 | `KeywordPoolView.vue` |
| FE-S-011 | YMYL 待审核队列页 | [x] | P3 | REV-001 | `ReviewQueueView.vue` |
| FE-S-012 | 组织设置页（配额/成员） | [x] | P4 | ORG-001 | `OrganizationSettingsView.vue` |

### FE-S-004 验收
- [ ] 提交后展示 jobId + QUEUED 状态
- [ ] 禁止前端同步等待生成完成

### FE-S-006 验收
- [ ] 轮询间隔合理，onUnmounted 清理定时器
- [ ] 状态用 dictLabel，禁止 template 三元硬编码

---

## 模块 21 — 平台层：组织 organization/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| ORG-001 | Organization 模块（套餐名、月配额、成员 CRUD） | [x] | P4 | CORE-005 | `modules/organization/` |
| ORG-002 | Prisma：Organization.planName、monthlyArticleQuota | [x] | P4 | DB-001 | `prisma/schema.prisma` |

---

## 模块 22 — seo-factory：关键词池 keyword-pool/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| KW-001 | KeywordEntry 模型 + CRUD API | [x] | P3 | DB-001 | `modules/keyword-pool/` |
| KW-002 | 批量导入 + 优先级排序 | [x] | P3 | KW-001 | `modules/keyword-pool/` |
| KW-003 | AI 种子生成（Prompt slot keywordSeed） | [x] | P3 | LLM-001, PROMPT-012 | `keyword-pool.service.ts` |
| KW-004 | Semrush 指标回填（IKeywordMetricsProvider） | [x] | P3 | SEO-001 | `keyword-pool.service.ts` |
| KW-005 | 从关键词一键创建 ArticleJob | [x] | P3 | JOB-002, KW-001 | `keyword-pool.controller.ts` |
| KW-006 | 关键词批量入队（多选 → batch create） | [x] | P3 | KW-005, BILL-005 | `POST .../keywords/create-jobs` + `KeywordPoolView` |

---

## 模块 23 — seo-factory：QuillBot 润色 paraphrase/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| PARA-001 | IParaphraseProvider + LlmParaphraseAdapter | [x] | P2 | PKG-003 | `modules/paraphrase/` |
| PARA-002 | 工作流 paraphrasing 步骤接线 | [x] | P2 | WF-005 | `workflow.service.ts` |
| PARA-003 | Prompt seo_quillbot_v1 / validate | [x] | P2 | PROMPT-012 | `prompts/`、`prompt-slot-metadata.ts` |
| PARA-004 | QUILLBOT_DISABLED 环境变量跳过 | [x] | P2 | PARA-002 | `paraphrase.service.ts` |

---

## 模块 24 — seo-factory：CMS 发布（WordPress，后端优先）

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| CMS-001 | CmsPublishService + POST publish API | [x] | P4 | EXP-002, SITE-004 | `cms-publish.service.ts` |
| CMS-002 | 前端 WordPress UI | [ ] | P4 | CMS-001 | `feature-flags.ts`（**暂缓**，后端可测 API） |

---

## 模块 25 — seo-factory：YMYL 审核队列

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| REV-001 | 待审核列表 + approve/reject API | [x] | P3 | WF-006 | `article-job.controller.ts` |
| REV-002 | 前端 ReviewQueueView | [x] | P3 | REV-001 | `ReviewQueueView.vue` |

---

## 模块 19 — 数据库 prisma/

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| DB-001 | 平台表 Organization/User/Project/CreditUsage | [x] | P0 | — | `prisma/schema.prisma` |
| DB-002 | seo-factory 表 Site/ArticleJob | [x] | P0 | — | `prisma/schema.prisma` |
| DB-003 | ArticleJob 过程字段补充（draftData、errorMessage） | [x] | P1 | — | `prisma/schema.prisma` |
| DB-004 | 内链页面库表 | [x] | P2 | LINK-002 | `prisma/schema.prisma` |
| DB-005 | PromptTemplate 表 | [x] | P4 | PROMPT-010 | `prisma/schema.prisma` |
| DB-006 | 索引优化（status、createdAt 复合索引） | [~] | P0 | — | `prisma/schema.prisma` |
| DB-007 | KeywordEntry 表 | [x] | P3 | KW-001 | `prisma/schema.prisma` |
| DB-008 | Site.cmsType / cmsConfig（WordPress） | [x] | P4 | SITE-004 | `prisma/schema.prisma` |
| DB-009 | Organization 配额字段 | [x] | P4 | ORG-002 | `prisma/schema.prisma` |
| DB-MIG | 正式 Prisma migration 与 db push 漂移对齐 | [x] | P0 | DB-* | `20260614120000_sync_quota_prompt_keyword_cms` |

### DB-003 验收
- [ ] Migration 可回滚
- [ ] 所有新字段有注释

---

## 模块 20 — 测试与质量

| ID | 任务 | 状态 | Phase | 依赖 | 落位 |
|----|------|------|-------|------|------|
| QA-001 | article-job 租户隔离测试 | [x] | P1 | JOB-007 | `scripts/tenant-isolation.test.mjs` |
| QA-002 | Serper Provider 单元测试（mock HTTP） | [ ] | P1 | SERP-001 | `providers/serper/` |
| QA-003 | LLM JSON 清洗单元测试 | [ ] | P1 | PKG-004 | `packages/shared-core/` |
| QA-004 | Workflow 集成测试（mock Provider） | [ ] | P2 | WF-004 | `modules/workflow/` |
| QA-007 | Semrush parser 单元测试 | [x] | P2 | SEO-003 | `scripts/semrush-recommendations-parser.test.mjs` |
| QA-009 | YMYL 检测单元测试 | [x] | P2 | WF-006 | `scripts/ymyl-detect.util.test.mjs` |
| QA-005 | 计费事件监听测试 | [x] | P4 | BILL-003 | `scripts/billing-event.test.mjs` |
| QA-006 | E2E：创建任务 → 队列 → 状态变更 | [x] | P3 | QUEUE-002 | `e2e/article-job-smoke.test.mjs` |

---

## 推荐开发顺序（关键路径）

按依赖顺序执行，避免返工：

```text
Phase 1 — 核心引擎
  CORE-007 → CORE-008 → CORE-006
  → SERP-001 → SERP-002 → SCRAPER-001 → SERP-003
  → LLM-002 → PROMPT-001/002 → LLM-003 → LLM-004
  → WF-001 → WF-002 → WF-003 → WF-004
  → QUEUE-001 → QUEUE-002 → JOB-002 → JOB-005

Phase 2 — 自动化
  → SEO-002 → SEO-003 → WF-005 → QUEUE-004/005
  → LINK-001 → LINK-004 → WF-007

Phase 3 — SaaS 化
  → AUTH-002 → CORE-005 → PROJ-002/003
  → SITE-001 → FE-S-001~008 → AUTH-006

Phase 4 — 变现
  → IMG-001 → EXP-002 → WF-009 → WF-010
  → BILL-001~003 → PROMPT-010~012
```

---

## 工作流 M1-M12 与任务映射

| 工作流 | 说明 | 对应任务 |
|--------|------|----------|
| 入队 | BullMQ 接管 | CORE-008, QUEUE-001, JOB-005 |
| M1-M3 | SERP + AI Overview | SERP-*, SCRAPER-*, WF-002 |
| M4-M5 | Brief + 初稿 | LLM-*, PROMPT-*, WF-003, WF-004 |
| M6 | Semrush ≥9.0 | SEO-*, LLM-005, WF-005 |
| QuillBot | paraphrasing 润色（可跳过） | PARA-*, WF-006b |
| M7 | YMYL 审查 | WF-006, REV-* |
| M8 | 内链植入 | LINK-*, WF-007 |
| M9 | BFL 官方配图 | IMG-*, WF-008 |
| M10 | HTML/JSON-LD → S3 | EXP-*, WF-009 |
| M11 | 计费 | BILL-*, WF-010 |
| M12 | Prompt 版本库 | PROMPT-010~014 |

---

## 文档维护

| 事件 | 动作 |
|------|------|
| 完成任务 | 本文件对应项改 `[x]`，更新 `docs/CURRENT_STATE.md` |
| 架构决策 | 新增 `docs/adr/ADR-NNN-标题.md` |
| 新增模块 | 同步更新 `.cursor/skills/seo-saas-platform/architecture.md` |
| Phase 完成 | 更新本文件「进度总览」表 |

---

*最后更新：2026-06-14 | 产品壳 + 关键词池 + QuillBot + 组织配额已接入；WordPress 前端 UI 暂缓，见 `docs/CURRENT_STATE.md`*
