# AI 写代码防漂移守则

> 本项目**全部由 AI 编写**。最大风险不是写错，而是**每次写法不一样、慢慢偏离架构**。
> 本文件优先级：与 `00-core.mdc` 并列，冲突时以架构红线为准，**一致性优先于「我觉得这样更好」**。

---

## 一、写之前必须做（Read-Before-Write）

**禁止不读代码就新建文件。**

| 步骤 | 做什么 |
|------|--------|
| 1 | 读 `SKILL.md` + 对应 reference（backend/frontend/architecture） |
| 2 | **在仓库里找同类文件**，当作模板（最近改过的同类 Module 优先） |
| 3 | 读要改的文件**及其邻居**（同目录 module、controller、service） |
| 4 | 确认目录是否已存在同类实现，**禁止重复造轮子** |
| 5 | 过 `01-checklist.mdc` 全部条目 |

```text
❌ 用户说「写 article-job 模块」→ 直接从头生成
✅ 先 glob 现有 *-job* 或 *article* 模块 → 克隆结构 → 按规范改内容
```

---

## 二、克隆不发明（Clone, Don't Invent）

### 有现成模式时

| 任务 | 必须克隆的模板 |
|------|---------------|
| 新 NestJS 模块 | 仓库里**最新的**一个 `modules/xxx/` 完整目录 |
| 新 Provider | 现有 `providers/serper/` 或 `deepseek/` |
| 新 API 端点 | 同模块现有 Controller 的方法 |
| 新 Vue 页面 | 同层级现有 `*View.vue` |
| 新 api 文件 | 现有 `*.api.ts` + `client.ts` 拦截器写法 |
| 新 Prisma model | 现有含 orgId+projectId 的 model |

### 禁止 AI 自行发明

| 禁止 | 原因 |
|------|------|
| 新文件夹命名风格（如 `services/` 代替 `modules/`） | 破坏一致性 |
| 新响应格式（如 `{ success, result }`） | 前端/client 已约定 |
| 新错误处理方式（如直接 `throw new Error()`） | 必须用 BusinessException 体系 |
| 新日志方式（console、自定义 logger） | 必须用项目 LoggerService |
| 新 HTTP 客户端（fetch 裸调、新装 axios 实例） | 必须走 `api/client.ts` |
| 新状态管理（ref 全局变量、mitt 乱用） | Pinia + composable |
| Options API、class component | 项目统一 script setup |

**规则：仓库里已经有一种写法 → 永远跟那种写法，不要「优化」成另一种。**

---

## 三、范围锁（Scope Lock）

### 只改用户要求的

- ❌ 顺手重构隔壁文件
- ❌ 统一命名/格式化全项目
- ❌ 升级依赖版本
- ❌ 删除「看起来没用」的代码
- ❌ 把本次任务扩成「顺便把 X 也做了」

### 必须改全链路时（用户说「加功能 X」）

新建后端 API 时，**一次 PR 内必须同时完成**：

```
□ Service + Controller + DTO
□ 注册到 *.module.ts
□ error-codes.ts 加错误码
□ Prisma schema（若需要）+ 注释
□ 前端 api/*.api.ts
□ 前端页面/组件（若需要）
□ 路由注册
□ 至少 1 个相关测试
```

**禁止**：只写 Service 不注册 Module、只写 API 不写前端、只改 schema 不 migrate。

---

## 四、依赖锁（Dependency Lock）

### 禁止擅自引入

- ❌ 新 npm 包（除非用户明确同意）
- ❌ 新 UI 库组件风格混用
- ❌ 新 ORM / 新队列 / 新鉴权方案

### 允许的替代

- 项目已有依赖的**官方用法**（如 NestJS 内置、已装的 class-validator）
- `packages/` 里已有的共享模块

**需新依赖时**：先告知用户「建议装 X，原因是 Y」，等确认再改 `package.json`。

---

## 五、类型与编译纪律（禁止放水）

AI 为通过编译常做的破坏行为 — **一律禁止**：

| 禁止 | 应用 |
|------|------|
| `any` | 用 `unknown` + 类型收窄 |
| `@ts-ignore` / `@ts-expect-error` | 修类型，不写屏蔽 |
| `as any` 强转 | 定义正确 Interface |
| 删/注释测试让 CI 过 | 修测试或修代码 |
| 放宽 `tsconfig` strict | 永不改动 |
| Prisma Model 直接返回前端 | 映射 Response DTO |

---

## 六、命名与风格一致性

### 跟仓库，不跟 AI 偏好

写之前 `grep` 确认项目内已有命名：

```text
文件名    → kebab-case.ts（后端）、PascalCase.vue（组件）
类名      → PascalCase
方法名    → camelCase
常量      → SCREAMING_SNAKE
路由      → kebab-case 复数 /api/v1/article-jobs
队列名    → seo-factory:article-job
事件名    → article.completed（点分隔）
```

**同一概念全项目用一个词**：如 `organizationId` 不要有时写 `orgId` 有时写 `tenantId`（局部变量 `orgId` 从 `organizationId` 赋值可以）。

---

## 七、注册表文件（漏改 = 功能不生效）

以下文件是「接线员」，AI 最常漏：

| 新增内容 | 必须同步改 |
|---------|-----------|
| NestJS Module | 父级 `*.module.ts` 的 imports |
| Controller 路由 | 确保 Guard 链完整 |
| Provider 实现 | `*.module.ts` providers + token 绑定 |
| BullMQ Processor | 队列名与 Producer 一致 |
| Prisma model | `schema.prisma` 注释 + 考虑索引 |
| project-type 插件 | `IProjectTypePlugin` 注册表 |
| Vue 页面 | `router/routes/*.routes.ts` 懒加载 |
| 错误码 | `error-codes.ts` |

**输出代码时**，在末尾列出「已注册的接线点」清单，方便人工核对。

---

## 八、与现有代码冲突时怎么办

```
现有代码违反规范？
  ├─ 用户只要求改附近功能 → 新代码跟规范，不扩大重构旧代码
  ├─ 用户要求重构 → 按 maintainability.md 改，单独 PR
  └─ 不确定 → 跟现有文件风格保持模块内一致，并告知用户「此处与规范不符，建议后续重构」
```

**禁止**：为了「统一规范」在用户没要求时重写整个模块。

---

## 九、每次交付格式（强制）

代码输出末尾附简短交付说明：

```markdown
## 变更摘要
- 新增：`path/to/file.ts` — 用途
- 修改：`path/to/module.ts` — 注册 XxxModule

## 接线确认
- [x] 已注册到 app.module / 父 module
- [x] 错误码已加
- [x] 路由已加（如适用）

## 自检
- [x] 已过 01-checklist
- [x] 克隆自模板：modules/xxx/
- [x] 未引入新依赖
- [x] 未改范围外文件
```

---

## 十、高频漂移场景预警

| 场景 | AI 常犯错误 | 正确做法 |
|------|------------|---------|
| 调外部 API | Service 里直接 axios | Provider 适配器 |
| 文章生成 | Controller 同步等结果 | 202 + BullMQ |
| 计费 | 生成完毕直接 deduct | 发事件，billing 监听 |
| 查任务 | findUnique({ id }) | 带 orgId+projectId |
| 前端报错 | `alert(err)` | ElMessage + error.message |
| 复用逻辑 | 复制粘贴改名字 | 抽 composable/Service |
| 配置 | 硬编码 API Key | 环境变量 |
| Prompt | 写在 service 字符串里 | 外置 .md 模板 |
| 状态 | 全局变量记 job 进度 | DB ArticleJob.status |
| 测试 | 不写 / 测 mock 假数据 | 至少测租户隔离 |

---

## 十一、会话间记忆（跨对话一致性）

AI 无跨会话记忆，靠**代码和文档**保持一致：

- **规范以 `.cursor/rules/` + `.cursor/skills/` 为唯一真相**，不凭「上次对话」
- 每次开写先读 Skill，不假设「项目已经有什么」
- 用户说「继续上次」→ 必须先读相关文件再动手
- 重大决策写入 `docs/adr/`，避免下轮 AI 推翻

---

## 十二、推荐在仓库放的锚点文件（后期）

代码开始写后，建议尽早有（AI 每次对照）：

```
apps/platform/api/src/modules/_template/           # 复制创建新 Module
apps/platform/api/src/project-types/seo-factory/providers/_template/
apps/platform/web/src/views/_template/
docs/CURRENT_STATE.md                              # 跨对话进度锚点
docs/adr/                                          # 架构决策
```

**已就绪**，AI 必须复制 `_template/`，禁止从零发明结构。
