---
name: seo-saas-platform
description: >-
  SEO SaaS 企业平台开发规范，全项目由 AI 编写。涵盖防漂移守则、NestJS 后端、
  Vue3 前端、多租户架构、API、工作流 M1-M12。在 wm 项目写任何代码前必须使用。
---

# SEO SaaS 平台开发规范

## AI 写代码流程（每次必走）

```
1. 读 ai-guardrails.md → 找仓库同类文件当模板（禁止从零发明）
2. 读对应 reference → 过 01-checklist.mdc
3. 写代码 → 接线注册齐全 → 交付时列变更清单
```

**跨对话无记忆：以 rules/skills 和仓库现有代码为准，不凭「上次说了什么」。**

## 使用方式

1. 先读 [ai-guardrails.md](ai-guardrails.md)
2. 过 `.cursor/rules/01-checklist.mdc`
3. 按任务读下方 reference
4. 交付附变更摘要 + 接线确认

## Reference 导航

| 文件 | 内容 |
|------|------|
| [architecture.md](architecture.md) | 三层架构、目录、工作流 M1-M12、插件注册 |
| [backend.md](backend.md) | 后端工程、API、Prisma、错误、日志、模板 |
| [frontend.md](frontend.md) | Vue3 组件、目录、Pinia、API 层、性能 |
| [ops.md](ops.md) | 安全、性能、可靠性、数据治理、测试、工具链 |
| [maintainability.md](maintainability.md) | 依赖边界、防屎山、复杂度预算、质量门禁、ADR |
| [ai-guardrails.md](ai-guardrails.md) | **AI 防漂移：读再写、克隆不发明、范围锁、接线清单** |

## 常见任务速查

### 新建后端模块

1. 在 `modules/`（平台）或 `project-types/seo-factory/modules/`（插件）建目录
2. 创建 module + controller + service + dto/
3. 每个文件加 docstring；Controller ≤15行/方法
4. Service 查询带 orgId+projectId；外部调用走 Provider
5. 注册到对应 `*.module.ts`

### 新建 API 端点

1. 路由 `/api/v1/...`；响应 `{ data, meta: { traceId } }`
2. 长任务返回 202 + QUEUED 状态
3. 错误码加到 `core/exceptions/error-codes.ts`；`error.message` 写中文提示

### 新建前端页面

1. 读 `vue.mdc` + `module-structure.mdc` 确定落位
2. `views/platform/` 或 `views/projects/<type>/` 建 `*View.vue`，顶部 `<!-- docstring -->`
3. `api/platform/` 或 `api/<type>/` 封装 HTTP；composable 处理业务逻辑
4. `router/modules/*.ts` 注册懒加载路由

### 新建项目类型插件

1. `project-types/{type}/` + 实现 `IProjectTypePlugin`
2. 前端 `views/projects/{type}/` + 相关组件
3. 插件互不可见；计费走平台层
