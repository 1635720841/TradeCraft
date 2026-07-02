# ADR-004: 项目类型 Port 抽象

- **状态**：已采纳
- **日期**：2026-07-01

## 背景

平台层（组织生产看板、计费、Console 站点、全局搜索、通知链接）多处硬编码 `seo-factory`，阻碍第二项目类型接入。

## 决策

1. 在 `@wm/platform-sdk` 定义 Port 契约：`ProductionStatsPort`、`BillingMeterPort`、`ConsoleSiteEnrichmentPort`、`ProjectSearchPort`
2. 各 `project-type` 在 `OnModuleInit` 向 `core/*/registry` 注册实现
3. 平台消费方只依赖 registry + `project-navigation.util`（`enterPath` / `buildProjectResourcePath`）
4. Console GSC 桥接子模块经 `IProjectTypePlugin.bridgeModules()` 由 `AppModule` 装配，避免 `ConsoleModule` 直接 import 插件

## 后果

- 新增项目类型只需实现 Port + 注册插件，不必改 `org-production.service` / `billing.service` 核心逻辑
- `demo-factory` 空壳插件用于验证全链路
- Port 注册表在进程内单例，测试需 build 后 import dist
