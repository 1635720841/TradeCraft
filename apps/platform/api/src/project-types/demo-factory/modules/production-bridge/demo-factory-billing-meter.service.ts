/**
 * demo-factory 计费计量 Port（空实现）。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BillingMeterPort } from '@wm/platform-sdk';
import { registerBillingMeterPort } from '../../../../core/billing/billing-meter.registry';

@Injectable()
export class DemoFactoryBillingMeterService implements BillingMeterPort, OnModuleInit {
  readonly projectType = 'demo-factory';

  onModuleInit(): void {
    registerBillingMeterPort(this);
  }

  meters() {
    return [];
  }

  async countInFlightUsage(): Promise<number> {
    return 0;
  }
}
