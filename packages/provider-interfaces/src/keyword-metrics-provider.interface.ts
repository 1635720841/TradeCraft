export interface KeywordMetricsQuery {
  keywords: string[];
  /** Semrush 数据库代码，如 us、uk、cn */
  database?: string;
}

export interface KeywordMetricsResult {
  keyword: string;
  searchVolume?: number | null;
  keywordDifficulty?: number | null;
  cpc?: number | null;
}

export interface IKeywordMetricsProvider {
  fetchMetrics(query: KeywordMetricsQuery): Promise<KeywordMetricsResult[]>;
}
