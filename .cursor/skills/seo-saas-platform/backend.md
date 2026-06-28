# 后端工程规范

## 文件头 docstring（每个 .ts 强制）

```typescript
/**
 * 文章任务服务：负责 ArticleJob 创建、状态流转与查询。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowService）、外部 API（Provider）
 *
 * 入口：
 * - ArticleJobService
 */
```

## 模块结构

```
modules/article-job/
├── article-job.module.ts
├── article-job.controller.ts    # ≤15行/方法，只做校验+转发
├── article-job.service.ts
├── dto/
│   ├── create-article-job.dto.ts
│   └── article-job-response.dto.ts
└── __tests__/article-job.service.spec.ts
```

## 代码量上限

| 类型 | 上限 |
|------|------|
| .ts 文件 | 300 行 |
| 方法 | 50 行 |
| Controller 方法 | 15 行 |

## 依赖注入

```typescript
constructor(
  private readonly prisma: PrismaService,
  @Inject(SERP_PROVIDER) private readonly serp: ISerpProvider,
  private readonly logger: LoggerService,
) {}
// ❌ 禁止 new 外部服务、Service 内 import 具体 Adapter
```

## RequestContext

```typescript
interface RequestContext {
  traceId: string;
  userId: string;
  organizationId: string;
  projectId?: string;
  role: Role;
}
// 禁止从 DTO/body 读取 organizationId 作权限依据
```

## 数据库

- Service 层唯一访问 Prisma；列表必分页；select 指定字段
- 双重隔离：`findFirst({ where: { id, organizationId, projectId } })`
- 跨表写：`prisma.$transaction()`；事件在事务提交后发布
- Migration：Expand-Contract（先加字段，后删旧字段）

## Prisma 核心模型

```prisma
model Project {
  id String @id @default(uuid())
  organizationId String
  name String
  projectType String   // 'seo-factory'
  config Json?
  status ProjectStatus @default(ACTIVE)
}

model ArticleJob {
  id String @id @default(uuid())
  traceId String @unique
  organizationId String
  projectId String
  targetKeyword String
  status JobStatus @default(QUEUED)
  briefData Json?
  serpData Json?
  semrushScore Float?
  outputUrl String?
}
// 索引：organizationId, projectId, status, createdAt
```

## 错误处理

```
AppException → BusinessException(4xx) / NotFoundException / ForbiddenException / ExternalApiException(502)
```

```typescript
throw new BusinessException('QUOTA_EXCEEDED', '...', { orgId, projectId });
// 禁止空 catch；Controller 不 catch，由全局 ExceptionFilter 格式化
```

错误码统一在 `core/exceptions/error-codes.ts`。

## 日志

```typescript
this.logger.info('Article job created', {
  traceId, organizationId, projectId, jobId, action: 'article_job.create',
});
// 禁止 console.log；脱敏 token/email/prompt
```

## API 规范

### 路由

```
/api/v1/org/...          # 企业资料、成员、项目、计费
/api/v1/console/...      # 平台运营台（租户、审计、Prompt）
/api/v1/projects/:projectId/article-jobs
```

### 响应

```typescript
// 成功 200/201
{ data: T, meta: { traceId, pagination? } }
// 异步 202
{ data: { id, status: 'QUEUED' }, meta: { traceId } }
// 失败
{ error: { code: 'QUOTA_EXCEEDED', message: '本月配额已用完', traceId } }
```

- `code` 供程序判断；`message` 为中文用户提示，前端直接展示（MVP 不做国际化）

### 异步任务

```
POST → 202 Accepted（Idempotency-Key 防重复）
GET  → 200 轮询状态（QUEUED → RESEARCHING → ... → COMPLETED/FAILED）
```

### Controller 模板

```typescript
@Controller('api/v1/projects/:projectId/article-jobs')
@UseGuards(AuthGuard, ProjectGuard)
export class ArticleJobController {
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() dto: CreateArticleJobDto, @Ctx() ctx: RequestContext) {
    const job = await this.service.create(dto, ctx);
    return { data: toResponseDto(job), meta: { traceId: ctx.traceId } };
  }
}
```

## 管道顺序

```
Middleware(TraceId) → Guard(Auth→Project→Role) → Interceptor → Pipe(ValidationPipe whitelist) → Controller → Service → ExceptionFilter
```

## BullMQ Processor 模板

```typescript
/**
 * 文章生成处理器：消费队列，驱动 M1-M10。
 * 边界：- 不负责：入队（ArticleJobService）
 * 入口：ArticleJobProcessor
 */
@Processor('seo-factory:article-job')
export class ArticleJobProcessor {
  @Process()
  async handle(job: Job<ArticleJobPayload>) {
    // 1.幂等检查 2.更新状态 3.WorkflowService 4.异常→DLQ
  }
}
```

## LLM JSON 清洗

```typescript
const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();
return JSON.parse(cleaned);
```

## 文件命名

kebab-case：`article-job.service.ts`, `create-article-job.dto.ts`, `serper.adapter.ts`
禁止：`utils.ts`, `helpers.ts`, PascalCase 文件名

## Import 顺序

Node内置 → 第三方 → packages → @/core → 同模块相对路径
