/**
 * 健康检查 HTTP 入口。
 *
 * 边界：
 * - 不负责：深度依赖检测（后期扩展 DB/Redis 探测）
 *
 * 入口：
 * - HealthController
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../../core/decorators/public.decorator';

@Controller('api/v1/health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { data: { status: 'ok' }, meta: { traceId: 'health' } };
  }
}
