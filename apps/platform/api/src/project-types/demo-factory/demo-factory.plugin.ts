/**
 * demo-factory 空壳插件：验证 IProjectTypePlugin 全链路。
 */

import { DemoFactoryModule } from './demo-factory.module';
import type { IProjectTypePlugin } from '@wm/platform-sdk';

export const DemoFactoryPlugin: IProjectTypePlugin = {
  type: 'demo-factory',

  register() {
    return DemoFactoryModule;
  },

  registerMenu() {
    return [{ path: 'overview', label: '概览' }];
  },

  permissions() {
    return [
      { id: 'project:read', name: '查看项目', module: 'project' },
      { id: 'demo:item:read', name: '查看演示项', module: 'demo' },
    ];
  },

  routePrefix() {
    return 'demo-factory';
  },

  billingMeters() {
    return [];
  },
};
