/**
 * 计费计量 Port：各 project-type 插件实现 in-flight 计数等。
 */

import type { BillingMeterDescriptor } from './project-type-plugin.interface';

export interface BillingMeterPort {
  readonly projectType: string;
  meters(): BillingMeterDescriptor[];
  countInFlightUsage(organizationId: string, meterId: string): Promise<number>;
}
