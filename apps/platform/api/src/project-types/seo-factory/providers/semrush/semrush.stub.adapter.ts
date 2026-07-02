/**
 * Semrush 查分适配器（占位 / M6 optimizing）：RPA 实现前按环境变量决定是否跳过。
 *
 * 边界：
 * - 不负责：本地轻量评分（shared-core scoreLocalSeo）
 *
 * 入口：
 * - SemrushStubAdapter
 */

import { Injectable } from '@nestjs/common';
import type { ISeoCheckerProvider, SeoCheckInput, SeoScore } from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';

@Injectable()
export class SemrushStubAdapter implements ISeoCheckerProvider {
  constructor(private readonly logger: LoggerService) {}

  async checkScore(input: SeoCheckInput): Promise<SeoScore> {
    if (process.env.SEMRUSH_ENABLED !== 'true') {
      this.logger.info('Semrush check skipped (SEMRUSH_ENABLED!=true)', {
        action: 'semrush.skipped',
        keyword: input.keyword,
      });
      return {
        overall: 0,
        suggestions: ['Semrush 未启用，已跳过最终检验（设置 SEMRUSH_ENABLED=true 后接入 RPA）'],
        skipped: true,
      };
    }

    throw new BusinessException(
      ErrorCodes.EXTERNAL_API_ERROR,
      'Semrush RPA 适配器尚未实现（P2），请先关闭 SEMRUSH_ENABLED 或等待 SEO-002 完成',
    );
  }
}
