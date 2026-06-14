/**
 * 跳过 org 限流（如健康检查已由 @Public 跳过 Auth，一般无需此装饰器）。
 */

import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
