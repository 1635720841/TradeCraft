/**
 * Semrush Analytics API 关键词指标适配器（phrase_these + phrase_kdi）。
 *
 * 边界：
 * - 不负责：关键词池持久化（KeywordPoolService）
 * - 需配置 SEMRUSH_API_KEY；未配置时由 Stub 适配器兜底
 *
 * 入口：
 * - SemrushApiKeywordMetricsAdapter
 */

import { Injectable } from '@nestjs/common';
import type {
  IKeywordMetricsProvider,
  KeywordMetricsQuery,
  KeywordMetricsResult,
} from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { LoggerService } from '../../../../core/logger/logger.service';
import { fetchWithRetry } from '../../../../core/http/http-fetch';

const SEMRUSH_API_BASE = 'https://api.semrush.com/';
const REQUEST_TIMEOUT_MS = 30_000;
const BATCH_SIZE = 10;

interface ParsedPhraseRow {
  keyword: string;
  searchVolume?: number | null;
  cpc?: number | null;
}

@Injectable()
export class SemrushApiKeywordMetricsAdapter implements IKeywordMetricsProvider {
  constructor(private readonly logger: LoggerService) {}

  async fetchMetrics(query: KeywordMetricsQuery): Promise<KeywordMetricsResult[]> {
    const apiKey = process.env.SEMRUSH_API_KEY?.trim();
    if (!apiKey) {
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        '未配置 SEMRUSH_API_KEY，无法调用 Semrush 关键词 API',
      );
    }

    const database = query.database?.trim() || process.env.SEMRUSH_DATABASE?.trim() || 'us';
    const keywords = [...new Set(query.keywords.map((item) => item.trim()).filter(Boolean))];

    if (keywords.length === 0) {
      return [];
    }

    const volumeMap = new Map<string, ParsedPhraseRow>();

    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      const batch = keywords.slice(i, i + BATCH_SIZE);
      const rows = await this.fetchPhraseThese(apiKey, database, batch);
      for (const row of rows) {
        volumeMap.set(this.normalizeKey(row.keyword), row);
      }
    }

    const results: KeywordMetricsResult[] = [];

    for (const keyword of keywords) {
      const normalized = this.normalizeKey(keyword);
      const volumeRow = volumeMap.get(normalized);
      const keywordDifficulty = await this.fetchKeywordDifficulty(apiKey, database, keyword);

      results.push({
        keyword,
        searchVolume: volumeRow?.searchVolume ?? null,
        cpc: volumeRow?.cpc ?? null,
        keywordDifficulty,
      });
    }

    this.logger.info('Semrush keyword metrics fetched', {
      count: results.length,
      database,
    });

    return results;
  }

  private async fetchPhraseThese(
    apiKey: string,
    database: string,
    keywords: string[],
  ): Promise<ParsedPhraseRow[]> {
    const params = new URLSearchParams({
      type: 'phrase_these',
      key: apiKey,
      phrase: keywords.join(';'),
      export_columns: 'Ph,Nq,Cp',
      database,
    });

    const response = await this.requestSemrush(`${SEMRUSH_API_BASE}?${params.toString()}`);
    return this.parsePhraseThese(response, keywords);
  }

  private async fetchKeywordDifficulty(
    apiKey: string,
    database: string,
    keyword: string,
  ): Promise<number | null> {
    const params = new URLSearchParams({
      type: 'phrase_kdi',
      key: apiKey,
      phrase: keyword,
      export_columns: 'Ph,Kd',
      database,
    });

    try {
      const response = await this.requestSemrush(`${SEMRUSH_API_BASE}?${params.toString()}`);
      const lines = response
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        return null;
      }

      const values = lines[1].split(';');
      const kd = Number(values[1]);
      return Number.isFinite(kd) ? Math.min(100, Math.max(0, kd)) : null;
    } catch (error) {
      this.logger.warn('Semrush KDI fetch failed', {
        keyword,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private parsePhraseThese(response: string, requested: string[]): ParsedPhraseRow[] {
    const lines = response
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return requested.map((keyword) => ({ keyword }));
    }

    const rows: ParsedPhraseRow[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const parts = lines[i].split(';');
      const keyword = parts[0]?.trim();
      if (!keyword) continue;

      const searchVolume = Number(parts[1]);
      const cpc = Number(parts[2]);

      rows.push({
        keyword,
        searchVolume: Number.isFinite(searchVolume) ? Math.round(searchVolume) : null,
        cpc: Number.isFinite(cpc) ? cpc : null,
      });
    }

    return rows;
  }

  private async requestSemrush(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchWithRetry(
        url,
        { method: 'GET', signal: controller.signal },
        { label: 'Semrush Analytics API' },
      );

      const body = await response.text();

      if (!response.ok) {
        throw new BusinessException(
          ErrorCodes.EXTERNAL_API_ERROR,
          `Semrush API 请求失败：HTTP ${response.status}`,
        );
      }

      if (body.toLowerCase().includes('error')) {
        throw new BusinessException(
          ErrorCodes.EXTERNAL_API_ERROR,
          `Semrush API 返回错误：${body.slice(0, 200)}`,
        );
      }

      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
