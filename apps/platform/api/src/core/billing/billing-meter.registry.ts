/**
 * BillingMeterPort 注册表：按 projectType 分发计量查询。
 */

import type { BillingMeterPort } from '@wm/platform-sdk';

const ports = new Map<string, BillingMeterPort>();

export function registerBillingMeterPort(port: BillingMeterPort): void {
  ports.set(port.projectType, port);
}

export function getBillingMeterPort(projectType: string): BillingMeterPort | undefined {
  return ports.get(projectType);
}

export function listBillingMeterPorts(): BillingMeterPort[] {
  return [...ports.values()];
}
