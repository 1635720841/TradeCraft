/**
 * 关键词指标 Stub：开发环境无 Semrush API Key 时使用确定性估算值。
 *
 * 边界：
 * - 不负责：生产真实 SEO 数据
 *
 * 入口：
 * - StubKeywordMetricsAdapter
 */

import { Injectable } from '@nestjs/common';
import type {
  IKeywordMetricsProvider,
  KeywordMetricsQuery,
  KeywordMetricsResult,
} from '@wm/provider-interfaces';
import { LoggerService } from '../../../../core/logger/logger.service';

function hashKeyword(keyword: string): number {
  let hash = 0;
  for (let i = 0; i < keyword.length; i += 1) {
    hash = (hash * 31 + keyword.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function estimateMetric(keyword: string, min: number, max: number): number {
  const span = max - min + 1;
  return min + (hashKeyword(keyword.toLowerCase()) % span);
}

@Injectable()
export class StubKeywordMetricsAdapter implements IKeywordMetricsProvider {
  constructor(private readonly logger: LoggerService) {}

  async fetchMetrics(query: KeywordMetricsQuery): Promise<KeywordMetricsResult[]> {
    const keywords = [...new Set(query.keywords.map((item) => item.trim()).filter(Boolean))];

    this.logger.info('Stub keyword metrics (dev estimate)', { count: keywords.length });

    return keywords.map((keyword) => ({
      keyword,
      searchVolume: estimateMetric(keyword, 120, 8_500),
      keywordDifficulty: estimateMetric(keyword, 18, 72),
      cpc: Math.round(estimateMetric(keyword, 50, 890) / 100) / 10,
    }));
  }
}
