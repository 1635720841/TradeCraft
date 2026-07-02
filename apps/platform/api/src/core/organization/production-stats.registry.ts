/**
 * ProductionStatsPort 注册表：按 projectType 分发企业生产统计。
 */

import type { ProductionStatsPort } from '@wm/platform-sdk';

const ports = new Map<string, ProductionStatsPort>();

export function registerProductionStatsPort(port: ProductionStatsPort): void {
  ports.set(port.projectType, port);
}

export function getProductionStatsPort(projectType: string): ProductionStatsPort | undefined {
  return ports.get(projectType);
}

export function listProductionStatsPorts(): ProductionStatsPort[] {
  return [...ports.values()];
}
