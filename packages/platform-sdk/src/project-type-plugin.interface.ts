/**
 * 项目类型插件：权限与路由描述符。
 */

export interface PermissionDescriptor {
  id: string;
  name: string;
  module: string;
}

export interface BillingMeterDescriptor {
  id: string;
  label: string;
}

/** 项目类型插件菜单项（供前端路由生成） */
export interface ProjectTypeMenuItem {
  path: string;
  label: string;
}

/**
 * 项目类型插件注册接口。
 * 每个 project-type（如 seo-factory）实现此接口并注册到平台。
 */
export interface IProjectTypePlugin {
  /** 插件类型标识，如 'seo-factory' */
  readonly type: string;

  /** 返回 NestJS DynamicModule 或 Module 类（在 api 层实现） */
  register(): unknown;

  /** 控制台菜单项 */
  registerMenu(): ProjectTypeMenuItem[];

  /** 插件权限目录 */
  permissions(): PermissionDescriptor[];

  /** API 路由前缀 */
  routePrefix(): string;

  /** 计费计量项（可选） */
  billingMeters?(): BillingMeterDescriptor[];
}
