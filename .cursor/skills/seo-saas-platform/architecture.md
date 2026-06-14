# 架构

## 三层模型

```
平台层 Platform  → auth, project, billing, console
    ↓ 1:N
项目层 Project   → 企业内工作空间，projectType 路由
    ↓
项目类型插件     → seo-factory, [future-type]
```

数据链：`Organization → Project → 业务实体`（Site, ArticleJob...）
所有业务表：`organizationId` + `projectId`

## Monorepo 目录

```
wm/
├── apps/platform/api/src/
│   ├── core/              # guards, exceptions, logger, context, event-bus
│   ├── modules/           # auth, project, billing
│   └── project-types/seo-factory/
│       ├── modules/       # workflow, scraper, llm, seo-checker, export
│       ├── providers/     # serper, deepseek, flux
│       └── processors/    # BullMQ
├── apps/platform/web/src/
└── packages/shared-core, platform-sdk, provider-interfaces
```

## 插件铁律

- `project-types/A` 禁止 import `project-types/B`
- 插件通过 `IProjectTypePlugin` 注册，不改平台 auth/billing 核心
- 队列前缀：`{projectType}:{taskName}`
- 共享逻辑放 `packages/`，第二次复用再抽取

## 防腐层接口

```typescript
interface ILLMProvider { generateBrief(...): Promise<BriefOutput>; }
interface ISerpProvider { fetchSerp(...): Promise<SerpResult>; }
interface IImageProvider { generateImage(...): Promise<ImageResult>; }
interface ISeoCheckerProvider { checkScore(...): Promise<SeoScore>; }
```

工作流只依赖接口，厂商通过 DI/环境变量 `PROVIDER_LLM=deepseek` 切换。

## 工作流 M1-M12

```
BullMQ 入队
→ M1-M3: ISerpProvider      SERP + AI Overview
→ M4-M5: ILLMProvider       Brief + 初稿（Prompt 外置，记 prompt_version）
→ M6:   ISeoCheckerProvider  Semrush ≥9.5 循环优化
→ M8:   内链植入
→ M9:   IImageProvider      Flux 配图
→ M10:  export              HTML/JSON-LD → S3
→ 事件 ArticleCompletedEvent → M11 计费 → 更新状态
```

- 编排器 `workflow/` 只调度，各步骤独立 Module
- 主流程完成只抛事件，计费/通知由 EventEmitter2 监听
- Prompt 禁止硬编码在 TS，存 `.md` 或数据库

## 事件驱动

```typescript
// 主流程末尾
this.eventBus.emit('article.completed', { traceId, organizationId, projectId, jobId });
// billing 模块监听，异步扣费
```

## 新增 project-type 流程

1. `project-types/{type}/` + `IProjectTypePlugin`
2. 在 `modules/project/` 注册表登记
3. 前端 views + 路由
4. Prisma 新增业务表（挂 projectId）

## 防屎山（架构红线）

> 完整守则见 [maintainability.md](maintainability.md)

- **依赖单向**：Controller→Service→DB/Provider；插件互不 import
- **热路径禁止 LLM/SERP/Playwright**；>3s 走队列
- **状态单一真相源**：任务状态只信 DB，大文件只信 S3
- **事务后发事件**；同 traceId 幂等
- **文件/类超行数必须拆**；复制第二处立即抽取
- **临时 hack 必须 TODO(日期,#issue)**，否则禁止合并
