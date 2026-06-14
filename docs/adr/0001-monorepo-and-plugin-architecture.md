# ADR-001: Monorepo + 平台插件架构

- **状态**：已采纳
- **日期**：2026-06-09

## 背景

B2B SaaS 企业平台，企业内管理多个项目。SEO 文章自动化是第一个项目类型，未来可平行扩展。

## 决策

1. **pnpm Monorepo**：`apps/platform`（api + web）+ `packages/`
2. **三层模型**：Platform → Project → ProjectType Plugin
3. **seo-factory** 作为第一个插件，位于 `project-types/seo-factory/`
4. **防腐层**：外部 API 通过 `@wm/provider-interfaces` + adapters
5. **MVP 不做国际化**，前端 template 直接写中文

## 后果

- 新 project-type 可平行接入，不改平台 auth/billing 核心
- 插件禁止互 import
- AI 复制 `_template/` 目录创建新模块，避免漂移
