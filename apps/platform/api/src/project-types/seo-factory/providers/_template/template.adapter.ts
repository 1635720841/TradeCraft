/**
 * [模板] 外部服务适配器：实现 IXxxProvider。
 *
 * 边界：
 * - 不负责：业务逻辑
 * - 不负责：直接暴露给 Controller（通过 DI 注入 Service）
 *
 * 入口：
 * - TemplateAdapter
 */

import { Injectable } from '@nestjs/common';
import type { ISerpProvider, SerpQuery, SerpResult } from '@wm/provider-interfaces';

@Injectable()
export class TemplateAdapter implements ISerpProvider {
  async fetchSerp(query: SerpQuery): Promise<SerpResult> {
    // TODO: 调用外部 API，含超时/重试/熔断
    return {
      organic: [],
      fingerprint: `${query.keyword}:${query.country}`,
    };
  }
}
