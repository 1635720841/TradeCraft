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
}
