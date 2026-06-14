/**
 * 健康检查模块。
 *
 * 边界：
 * - 不负责：业务逻辑
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
