# 运维、安全、性能、可靠性

## 安全

### 鉴权
- Logto/Supabase Auth，禁止自研密码
- RBAC：ADMIN 管成员/计费；MEMBER 操作授权项目
- 校验链：身份 → orgId → projectId → 权限

### IDOR 防护
```typescript
// ✅ 双重校验，404 不暴露存在性
findFirst({ where: { id, organizationId: ctx.orgId, projectId: ctx.projectId } })
```

### 输入输出
- DTO + class-validator；Prisma 参数化查询
- LLM HTML 经 DOMPurify 消毒
- 密钥只放环境变量，日志脱敏 token/email/prompt

### 限流
- 按 orgId/projectId 限流；昂贵操作检查配额
- 审计：成员变更、项目删建、计费变更、批量导出

## 性能

### 数据库
- 索引 orgId/projectId/status/createdAt
- 列表 cursor 分页，limit≤20，上限100
- 禁止 N+1；列表不返 outputHtml 大字段

### 缓存
| 数据 | TTL |
|------|-----|
| SERP | 24h Redis |
| Prompt 模板 | 1h |
| 项目配置 | 5min |

Key：`{service}:{orgId}:{projectId}:{fingerprint}`

### 队列
- BullMQ 按 projectType 独立队列 + concurrency 上限
- Playwright 浏览器池，用完 close
- 超时：API 30s · Playwright 120s · LLM 180s

### SLA 基线
- 控制台 API P95 <300ms
- 创建任务 P95 <500ms
- 文章全流程异步 15-30min

## 可靠性

### Provider 三件套
1. 超时 AbortController
2. 幂等读重试 3 次指数退避
3. 连续失败 5 次熔断 60s

### 队列
- attempts:3, backoff:exponential
- 超限 → DLQ，标记 FAILED
- 幂等：同 traceId 不重复扣费/生成
- Idempotency-Key 防重复提交

### 降级
- 工作流每步持久化 JobStatus，断点续跑
- M9 配图失败不回滚正文，降级无图发布
- 业务成功才触发 CreditDeductEvent

### 优雅停机
SIGTERM → 停接新任务 → 等 BullMQ 30s → 关 DB/Redis/Playwright

## 数据治理

| 操作 | 策略 |
|------|------|
| 删项目 | 软删除 ARCHIVED，30天后硬删 |
| ArticleJob | 90天后归档冷存储 |
| CreditUsage | 永久保留 |
| Schema 迁移 | Expand-Contract 三阶段 |

## 质量底线

- Semrush ≥9.5；YMYL 标记 requiresHumanReview
- article.html 语义化标签，禁止内联 CSS/污染 JS
- EEAT 信息增益，禁止洗稿

## 测试

| 层 | 要求 |
|----|------|
| 单元 | Service/工具，Mock Provider |
| 集成 | API+DB，租户隔离必测 |
| E2E | 创建项目→提交任务→查状态 |

## 工具链

- ESLint：禁 any、console.log、unused vars
- Prettier + Husky lint-staged
- tsconfig.base.json strict
- CI：typecheck → lint → test → build
- Feature Flag 灰度高风险功能

## 环境

local（假 Provider）· staging（沙箱 API）· production（隔离 Key/DB）
