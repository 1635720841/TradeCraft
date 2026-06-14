# 架构防屎山守则

> 目标：3 年后新人能在 1 天内定位问题、加功能不破坏现有逻辑。

## 一、依赖边界（最重要）

### 允许的单向依赖

```
Controller → Service → Repository(Prisma) / Provider(Adapter)
                ↓
           EventBus → 监听器（billing、通知）
packages/shared-core  ←  platform  ←  project-types（插件）
```

### 绝对禁止

| 禁止 | 后果 | 正确做法 |
|------|------|---------|
| 插件 import 另一插件 | 耦合爆炸 | 走 platform-sdk 接口或事件 |
| Service import Controller | 循环依赖 | 依赖倒置 |
| 业务模块直接 `new` Provider | 无法替换/测试 | DI 注入 Interface |
| 跨模块直接查对方数据库表 | 隐式耦合 | 调对方 Service 或发事件 |
| `packages/` 放业务逻辑 | 共享层污染 | 只放基建，业务留插件 |
| 循环 import | 编译/运行隐患 | 抽接口到 `packages/` |

### 何时抽 `packages/`

- ✅ 第二个模块也需要（日志、异常、TraceId）
- ❌ 只有 seo-factory 用（留插件内）
- ❌ 「以后可能复用」（YAGNI，第二次再抽）

---

## 二、单一职责与复杂度预算

### 文件/类职责（超限必须拆）

| 指标 | 上限 | 拆分信号 |
|------|------|---------|
| Service 方法 | 50 行 | 做了两件不相关的事 |
| Service 类 | 只负责一个聚合根 | 同时管 Job + Site + Billing |
| Module | 一个业务域 | workflow 里写了扣费逻辑 |
| Vue 页面 | 250 行 | 表单+列表+弹窗+轮询全塞一个文件 |
| if/else 嵌套 | 3 层 | 用 early return 或策略模式 |

### 上帝类识别（出现即重构）

- `XxxManager` / `XxxHelper` / `XxxUtils` 管多件事
- 一个 Service 注入超过 **5 个** 其他 Service
- 一个文件同时处理 HTTP、DB、外部 API、发邮件

---

## 三、状态与数据：单一真相源

### 状态放哪里

| 状态类型 | 存放 | 禁止 |
|---------|------|------|
| 任务进度 | DB `ArticleJob.status` | 内存 Map 记状态 |
| 任务过程数据 | DB `Json?` 字段 | 散落多个临时表 |
| 会话/权限 | Redis 或 Auth 提供商 | 自研 Session 表 |
| 昂贵 API 结果 | Redis 缓存 | 每次重新请求 |
| 大文件/HTML | S3 `outputUrl` | PostgreSQL Text 堆全文 |
| 配置 | 环境变量 + zod 校验 | 硬编码在代码里 |

### 一致性规则

- 跨表写 → `prisma.$transaction()`
- 事件发布 → **事务提交之后**，避免「事件发了但 DB 回滚」
- 工作流每步写完 DB 再进下一步（断点续跑）
- 同一 `traceId` 幂等：重复消费不产生第二篇文章/第二次扣费

---

## 四、性能架构（设计期就要想）

### 热路径 vs 冷路径

| 热路径（同步 API） | 冷路径（异步队列） |
|-------------------|-------------------|
| 列表查询、项目切换 | 文章生成 M1-M10 |
| P95 < 300ms | 15-30min 可接受 |
| 禁止调 LLM/SERP | Playwright RPA |

**红线**：热路径里禁止调用 LLM、SERP、Playwright。

### 查询预算（每个 API 请求）

- 最多 **3 次** DB 往返（含分页 count）
- 禁止 N+1：列表用 `select` + 批量查询
- 列表禁止返回 `outputHtml`、`briefData` 等大字段
- 单请求内存 < 10MB

### 缓存策略

- 先查 Redis → 没有再调外部 API → 写入缓存
- 缓存 Key 含 `orgId:projectId:fingerprint`，防租户串数据
- 必须有 TTL，禁止永不过期

---

## 五、质量门禁（Definition of Done）

新功能合并前必须满足：

- [ ] 租户隔离：A 企业无法访问 B 企业数据（集成测试）
- [ ] 文件头 docstring、无 `any`、无空 catch
- [ ] 外部调用走 Provider，有超时
- [ ] 长任务走队列，API 返回 202
- [ ] 错误码注册在 `error-codes.ts`
- [ ] 关键 Service 有单元测试（至少 happy path + 权限拒绝）
- [ ] 无 console.log；日志带 traceId

### PR 规模

- 单 PR < **500 行**有效变更；超出则拆分
- 一个 PR 只做一件事（功能 / 重构 / 修 bug 不混）

---

## 六、技术债管理

### 允许临时方案的条件

```typescript
// TODO(2026-08,#issue-42): 改用 WebSocket 替代轮询
```

必须含：**日期 + issue 编号 + 原因**。无 TODO 的 hack 禁止合并。

### 重构触发器

| 信号 | 行动 |
|------|------|
| 文件超 300 行 | 下次改动时拆分 |
| 同一 bug 修第三次 | 根因重构，非打补丁 |
| 复制粘贴第二处 | 立即抽取共用函数/Service |
| 模块被 3+ 模块依赖 | 评估是否应下沉 `packages/` |

### 禁止累积的屎山模式

- 注释掉的废代码（Git 有历史，直接删）
- `v2` `new` `old` 后缀文件并存
- `misc/` `temp/` `backup/` 目录
- 绕过 Guard 的「内部专用」API
- `// @ts-ignore` 不加说明

---

## 七、可观测性（排障生命线）

每个异步任务必须有：

```
traceId → 贯穿 API → 队列 → Provider 调用 → 日志
organizationId + projectId → 每条日志
```

### 必记日志点

| 事件 | 级别 | 字段 |
|------|------|------|
| 任务创建/完成/失败 | info | traceId, jobId, status |
| 外部 API 调用 | info | provider, duration_ms, cacheHit |
| 重试 | warn | attempt, error |
| 慢查询 >200ms | warn | query, duration_ms |
| 未捕获异常 | error | stack（仅 error 级） |

后期加指标：队列深度、API P95、单任务成本（CreditUsage）。

---

## 八、插件与平台职责矩阵

| 能力 | 平台层 | 插件层 |
|------|--------|--------|
| 登录/鉴权 | ✅ | ❌ |
| 项目 CRUD | ✅ | ❌ |
| 计费扣款 | ✅ 监听事件 | ❌ 禁止直接扣 |
| 任务编排 | ❌ | ✅ workflow |
| 外部 API | ❌ | ✅ 通过 Provider |
| 业务数据表 | 平台表 only | 插件表挂 projectId |

插件**禁止**：直接改 `Organization` 余额、绕过 Guard、注册全局中间件。

---

## 九、Schema 演进（防迁移地狱）

1. **只增不删**：新字段先可选 `?`
2. **过程数据**放 `Json?`，避免每加一个分析字段就 ALTER TABLE
3. **删字段**：先废弃 → 下版本移除（Expand-Contract）
4. **枚举扩展**：只加值，不改已有值含义
5. 每个 migration 写注释说明意图

---

## 十、AI 全量开发注意

本项目由 AI 编写，漂移风险高于人工开发。每次写代码**必须先读 [ai-guardrails.md](ai-guardrails.md)**：

- 克隆仓库同类文件，不发明新结构
- 不擅自加依赖、不扩大改动范围
- 新功能必须接线完整（module/路由/error-codes）
- 交付时列变更清单

建议尽早建立 `modules/_template/` 骨架目录供 AI 复制。

## 十一、架构决策记录（ADR，重大变更时）

重大技术选型变更时，在 `docs/adr/` 写简短记录：

```markdown
# ADR-001: 使用 BullMQ 而非 Temporal

- 状态：已采纳
- 背景：MVP 需要轻量队列
- 决策：BullMQ + 自研状态机
- 后果：复杂编排后期可能迁移 Temporal
```

触发 ADR：换数据库、换队列、换鉴权、新增 project-type、引入新外部依赖。
