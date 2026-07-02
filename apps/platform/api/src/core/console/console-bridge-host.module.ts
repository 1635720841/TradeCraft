/**
 * Console 插件桥接宿主：聚合各 project-type 的 bridgeModules，供 ConsoleModule 注入 Port。
 */

import { Module, Type } from '@nestjs/common';
import { getRegisteredProjectTypes } from '../../modules/project/project-type.registry';

const consoleBridgeModules = getRegisteredProjectTypes().flatMap(
  (plugin) => (plugin.bridgeModules?.() ?? []) as Type[],
);

@Module({
  imports: consoleBridgeModules,
  exports: consoleBridgeModules,
})
export class ConsoleBridgeHostModule {}
