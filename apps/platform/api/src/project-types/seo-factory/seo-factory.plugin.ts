/**
 * SEO 工厂项目类型插件：实现 IProjectTypePlugin 供平台注册。
 */

import { SeoFactoryModule } from './seo-factory.module';
import type { IProjectTypePlugin, ProjectTypeMenuItem } from '@wm/platform-sdk';

export const SeoFactoryPlugin: IProjectTypePlugin = {
  type: 'seo-factory',

  register() {
    return SeoFactoryModule;
  },

  registerMenu(): ProjectTypeMenuItem[] {
    return [{ path: 'jobs', label: '文章任务' }];
  },

  permissions() {
    return [
      { id: 'project:read', name: '查看项目', module: 'project' },
      { id: 'project:update', name: '编辑项目', module: 'project' },
      { id: 'seo:job:create', name: '创建任务', module: 'seo' },
      { id: 'seo:job:read', name: '查看任务', module: 'seo' },
      { id: 'seo:keyword:manage', name: '管理词库', module: 'seo' },
      { id: 'seo:site:manage', name: '管理站点', module: 'seo' },
    ];
  },

  routePrefix() {
    return 'seo-factory';
  },

  billingMeters() {
    return [{ id: 'article.completed', label: '完成文章' }];
  },
};
