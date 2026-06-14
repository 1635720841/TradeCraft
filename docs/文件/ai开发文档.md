AI 全栈开发指南：SEO 自动化内容工厂 (B2B SaaS 架构)
1. 项目愿景与背景 (Context & Vision)
本项目旨在开发一套面向 B2B 企业的“SEO 文章自动化生产系统”。
系统将经历从 MVP（内部使用的单机自动化脚本） 到 最终态（支持多租户的 B2B SaaS 平台） 的演进。

作为 AI 编程助手，你在编写任何代码时，必须始终遵循以下原则：

MVP 务实性： 前期代码可以精简，但绝对不能破坏后续扩展的底层结构。

SaaS 基因： 所有核心数据库表必须带有租户隔离（organizationId）设计。

极度解耦： 外部依赖（大模型、搜索引擎抓取、第三方工具）随时可能因为价格或风控原因被替换，严禁在业务逻辑中硬编码外部服务。

低成本优先： 必须考虑 API 调用的缓存（防御性缓存），避免重复调用。

2. 技术栈约束 (Technology Stack Strict Rules)
你在生成代码时，必须严格使用以下技术栈，不得随意引入其他同类替代品：

运行环境: Node.js (v20+)

开发语言: TypeScript (必须开启 strict: true，禁用 any)

后端框架: NestJS (严格遵守其 Controller-Service-Module 的 DDD 领域驱动设计)

数据库: PostgreSQL

ORM: Prisma (所有 Schema 必须带有详细注释)

缓存与队列: Redis + BullMQ (所有耗时超过 3 秒的任务必须进队列)

自动化抓取: Playwright (配合 playwright-extra 和 stealth 插件)

日志与追踪: winston 或 pino (必须支持 TraceID)

3. 核心架构铁律 (Core Architectural Patterns)
作为 AI，你生成的代码必须符合以下 5 大高级架构设计：

3.1 多租户与数据隔离 (Multi-tenancy)
所有业务表（如 Site, Keyword, ArticleJob, PromptTemplate）的 Schema 设计中，必须包含 organizationId。在 Service 层的查询中，必须强制校验租户归属，防止数据越权。

3.2 防腐层设计 (Anti-Corruption Layer) & 依赖倒置
系统中存在四大极易变动的外部服务：LLM (大模型)、SERP (搜索引擎抓取)、ImageGen (配图)、SEO_Checker (Semrush)。

强制规定： 不得在具体业务 Service（如 ArticleService）中直接使用 axios 调用深度的外部 API。

实现方式： 必须定义抽象接口（如 ILLMProvider），并使用适配器模式（如 SerperAdapter, DataForSeoAdapter）。业务线只依赖接口。这保证了平台随时可以切换到更低价的服务商。

3.3 Prompt 版本化治理 (Prompt as Code)
强制规定： 严禁在 TypeScript 源码中拼接大段的 AI Prompt 字符串。

实现方式： 将 Prompt 独立为模板库（前期为 .md 文件，后期存入数据库）。调用时记录 prompt_version，以便回溯和 A/B 测试。

3.4 事件驱动架构 (Event-Driven)
对于文章生成完毕后的周边逻辑（扣费、发通知、写日志、推送到建站系统），严禁在主流程代码末尾堆砌。

实现方式： 使用 NestJS 的 EventEmitter2。主流程完成 M10 步骤后，只负责抛出 ArticleCompletedEvent。计费和通知逻辑通过订阅该事件异步处理。

3.5 结构化日志与可观测性 (Observability)
强制规定： 严禁使用单纯的 console.log()。

实现方式： 当一个任务（ArticleJob）发起时，生成全局 TraceId。后续的 Playwright 抓取、大模型请求、队列重试，必须在日志的 payload 中携带此 TraceId 和 OrganizationId。

4. 目录结构规范 (Directory Structure)
项目采用 Monorepo 思想的模块化单体架构。生成代码时请遵循以下约定：

Plaintext
src/
 ├── core/                   # 核心基建 (AI无需经常修改)
 │    ├── database/          # Prisma Client 实例化
 │    ├── logger/            # 带 TraceID 的全局日志模块
 │    ├── exceptions/        # 全局异常拦截器
 │    └── event-bus/         # 全局事件总线配置
 ├── modules/                # 业务模块 (高内聚，低耦合)
 │    ├── auth/              # 身份与工作空间 (Workspace) 管理
 │    ├── billing/           # 扣费与 API 用量统计 (Credit Usage)
 │    ├── workflow/          # 任务编排引擎 (M1-M10 主流程控制)
 │    ├── scraper/           # M1, M3: SERP 与网站爬虫 (包含防腐层)
 │    ├── llm/               # M4, M5, M7: 大模型网关与 Prompt 管理
 │    ├── seo-checker/       # M6: Semrush RPA 自动化模块
 │    └── export/            # M9, M10: HTML打包与配图下载
 ├── providers/              # 外部服务适配器实现 (Adapters)
 │    ├── serper/            # Serper.dev 低价实现
 │    ├── deepseek/          # DeepSeek LLM 实现
 │    └── flux/              # 硅基流动 Flux 绘图实现
 └── app.module.ts           # 根模块
5. 对 AI 生成代码的具体要求 (AI Coding Metarules)
当你（AI）接收到我具体的开发指令（例如：“帮我写 M4 模块”）时，在输出代码前，请在内存中校验以下 CheckList：

异常捕获 (Error Handling)： 网络请求（尤其是外部 API 和 Playwright 脚本）是否被 try-catch 包裹？报错时是否抛出了清晰的自定义业务异常（BusinessException）并附带上下文？

绝对禁止吞噬错误： 不要写出空的 catch(e) {} 块。

JSON 清洗机制： 凡是调用大模型期望返回 JSON 格式的地方，是否添加了正则清理逻辑（去除 Markdown ```json 标记）后再进行 JSON.parse？

并发控制： 对于批量的异步任务（如批量抓取 10 个竞品页面），是否使用了控制并发度的方案（如 p-limit 或 BullMQ 速率限制），而不是野蛮的 Promise.all？

类型安全： Prisma 查询返回的数据结构，以及外部 API 调用的请求/响应载荷，是否都有对应的 Interface/Type 声明？

6. SaaS 数据库起点 (Prisma Schema 核心示例)
提供给 AI 参考的底层关系基准：

代码段
// schema.prisma

// 1. 租户与组织隔离
model Organization {
  id        String   @id @default(uuid())
  name      String
  users     User[]
  sites     Site[]
  jobs      ArticleJob[]
  usageLogs CreditUsage[]
  createdAt DateTime @default(now())
}

model User {
  id             String       @id @default(uuid())
  email          String       @unique
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  role           Role         @default(MEMBER)
}

// 2. 业务实体
model Site {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  domain         String
  brandVoice     String?
  jobs           ArticleJob[]
}

model ArticleJob {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  siteId         String
  site           Site         @relation(fields: [siteId], references: [id])
  targetKeyword  String
  status         JobStatus    @default(PENDING)
  traceId        String       @unique
  semrushScore   Float?
  outputHtml     String?      @db.Text
  createdAt      DateTime     @default(now())
}

// 3. 计费与用量
model CreditUsage {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  serviceType    String       // e.g., "SERP", "LLM", "RPA"
  provider       String       // e.g., "serper", "deepseek"
  cost           Float        // 换算后的法币成本
  tokensOrCount  Int
  traceId        String?
  createdAt      DateTime     @default(now())
}

enum Role {
  ADMIN
  MEMBER
}

enum JobStatus {
  PENDING
  RESEARCHING
  DRAFTING
  OPTIMIZING
  COMPLETED
  FAILED
}
阅读完毕后，请在未来的每一次对话中严格执行以上协议。