/**
 * 平台 SDK：项目类型插件注册接口与共享类型。
 *
 * 边界：
 * - 不负责：插件具体业务实现
 *
 * 入口：
 * - IProjectTypePlugin
 */

export * from './project-type-plugin.interface';
export * from './console-gsc.port';
export * from './production-stats.port';
export * from './billing-meter.port';
export * from './console-site-enrichment.port';
export * from './project-search.port';
