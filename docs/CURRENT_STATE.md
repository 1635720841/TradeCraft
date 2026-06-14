# 项目当前状态

> AI 跨对话必读：以本文件 + 仓库代码为准，不凭记忆。

## 阶段

**Phase 4 进行中 — M12 Prompt 版本库已接入**（S3、Logto、E2E 待实现）。

## 已完成

- [x] Monorepo 结构（pnpm workspace）
- [x] `packages/`：shared-core、platform-sdk、provider-interfaces
- [x] API 骨架：NestJS + Prisma Schema + Core 模块
- [x] 平台模块：health、project、auth、billing
- [x] **P1** Redis + BullMQ 基础设施（`core/redis/`、`core/queue/`）
- [x] **P1** 事件常量 `article.completed`（`core/event-bus/events.ts`）
- [x] **P1** Serper Provider + Redis 24h 缓存
- [x] **P1** LLM Provider（OpenAI 兼容 / DeepSeek）Brief + 初稿 + Prompt 外置
- [x] **P1** scraper / llm / workflow 模块（M1–M5 编排）
- [x] **P1** article-job Processor + 创建任务异步入队（202）
- [x] **P1** 开发种子数据（`pnpm db:seed`）
- [x] **P2** M6 Semrush：seo-checker + RPA 适配器 + 本地预检循环 + AI 优化
- [x] **P2** M7 YMYL：`modules/content-review/` + 工作流 `ymyl` 步骤 + 前端警告
- [x] **P2** M8 内链：`modules/linking/` + `SitePage` 页面库 + 工作流 `linking` 步骤
- [x] **P2** M9 配图：`modules/illustration/` + BFL Provider + 工作流 `images` 步骤
- [x] **P3** Auth：`modules/auth/` JWT 登录/刷新 + `AuthGuard` + `@ReqCtx()`
- [x] **P3** 项目 CRUD：`modules/project/` org 隔离列表/创建/归档
- [x] **P3** 前端真实登录 + 401 跳转 + 项目创建对话框
- [x] **P4** M10 导出：`modules/export/` + 本地存储 + 工作流接线 + 前端下载
- [x] **P4** M11 计费：`modules/billing/` 监听 `article.completed` + 用量 API
- [x] **P4** 对象存储骨架：`core/storage/`（本地 fallback，S3 SDK 待接）
- [x] **P4** 启动环境变量校验（INF-003）
- [x] **P4** M12 Prompt：`modules/prompt/` DB + Redis 1h + CRUD API + 前端管理页
- [x] 任务 API：批量创建、重试续跑、手动 Semrush 查分、AI 改写
- [x] 站点 API：列表 + sitemap 采集 + 页面库 sync/list
- [x] 单元测试：55 项；`cd apps/platform/api && pnpm test`
- [x] 模块模板：`modules/_template/`
- [x] Provider 模板：`providers/_template/`
- [x] Web：pure-admin-thin 接入 monorepo（Layout/登录/权限壳）
- [x] 平台页面：项目列表（`/platform/projects` → 真实 API）
- [x] 前端用量页：`/platform/billing`（BILL-006）
- [x] 前端 Prompt 管理页：`/platform/prompts`（PROMPT-014，ADMIN）
- [x] Cursor rules + skills

## 未实现（按 Roadmap 顺序）

- [ ] Logto/Supabase 外部 IdP 对接（当前为自建 JWT 开发 Auth）
- [ ] S3 生产存储（`S3_BUCKET` 已预留，当前回退本地 `.data/exports`）
- [ ] 竞品正文抓取（SCRAPER-002）
- [ ] Playwright 专用队列 + 浏览器池
- [x] 租户隔离单测（ArticleJob / Project + 计费幂等）
- [ ] E2E 测试
- [ ] 配额检查 Guard（BILL-005、CORE-010）

## 工作流现状（M1–M11）

```
SERP → Brief → 初稿 → 内链 → 配图 → Semrush 优化 → YMYL → 导出 → COMPLETED → 计费入账
```

| 步骤 | 状态 |
|------|------|
| M1–M3 SERP | ✅ |
| M4–M5 Brief + 初稿 | ✅ |
| M6 Semrush 优化 | ✅（门槛 9.0） |
| M7 YMYL | ✅ |
| M8 内链 | ✅ |
| M9 配图 | ✅ |
| M10 导出 | ✅（本地存储 + API 下载；YMYL 阻断可发布 HTML） |
| M11 计费 | ✅（`article.completed` → CreditUsage） |
| M12 Prompt | ✅（DB 热更新 + Redis 缓存 + 管理页） |

## 关键路径

| 能力 | 位置 |
|------|------|
| 开发任务清单 | `task.md` |
| 工作流编排 | `project-types/seo-factory/modules/workflow/` |
| 导出模块 | `project-types/seo-factory/modules/export/` |
| 计费模块 | `modules/billing/` |
| Prompt 模块 | `modules/prompt/` |
| 对象存储 | `core/storage/` |
| 内链模块 | `project-types/seo-factory/modules/linking/` |
| Semrush RPA | `providers/semrush/semrush-rpa.adapter.ts` |
| 单元测试 | `apps/platform/api/scripts/*.test.mjs`，`pnpm test` |
| Prisma | `apps/platform/api/prisma/schema.prisma` |

## 本地验证

```bash
pnpm docker:up
pnpm db:migrate
pnpm db:seed   # 开发账号 admin@dev.local / admin123
pnpm dev:api

# 单元测试
cd apps/platform/api && pnpm test
```

## 本地环境

安装与启动详见 **[docs/SETUP.md](SETUP.md)**。

基础设施：Docker PostgreSQL 16（5432）+ Redis 7（6379）
