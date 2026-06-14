/**
 * SEO 工厂项目类型插件：实现 IProjectTypePlugin 供平台注册。
 *
 * 边界：
 * - 不负责：平台层逻辑
 *
 * 入口：
 * - SeoFactoryPlugin
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
};
