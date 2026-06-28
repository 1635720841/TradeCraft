/**
 * 项目类型插件注册表：新增 project-type 只需在此登记。
 *
 * 插件模块延迟加载，避免 ProjectModule ↔ SeoFactoryModule 循环依赖。
 */

import type { IProjectTypePlugin } from '@wm/platform-sdk';
import { PROJECT_TYPE_CATALOG } from './project-type.descriptors';

let registry: IProjectTypePlugin[] | null = null;

function loadRegistry(): IProjectTypePlugin[] {
  if (!registry) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SeoFactoryPlugin } = require('../../project-types/seo-factory/seo-factory.plugin') as {
      SeoFactoryPlugin: IProjectTypePlugin;
    };
    registry = [SeoFactoryPlugin];
  }
  return registry;
}

export function getRegisteredProjectTypes(): IProjectTypePlugin[] {
  return [...loadRegistry()];
}

export function getProjectTypePlugin(type: string): IProjectTypePlugin | undefined {
  return loadRegistry().find((p) => p.type === type);
}

export function listProjectTypeDescriptors(): Array<{ type: string; label: string }> {
  return PROJECT_TYPE_CATALOG.map(({ type, label }) => ({ type, label }));
}
