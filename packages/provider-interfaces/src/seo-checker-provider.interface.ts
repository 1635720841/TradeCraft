export interface SemrushSuggestionDetails {
  readability?: string[];
  seo?: string[];
  tone?: string[];
  originality?: string[];
}

export interface SeoScore {
  overall: number;
  suggestions: string[];
  /** Semrush API 返回的推荐关键词（供下一轮改写与 SWA 目标） */
  semrushRecommendedKeywords?: string[];
  /** Semrush 竞品标杆词数（recommendations.length） */
  semrushCompetitorWordCount?: number;
  /** Semrush 检测到的当前正文词数（original_length） */
  semrushCurrentWordCount?: number;
  /** Semrush 可读性指数 0–100（<70 侧栏会提示过于复杂） */
  semrushReadabilityScore?: number;
  skipped?: boolean;
  /** 3ue 节点标识，如「节点3」 */
  node?: string;
  nodeLabel?: string;
  suggestionDetails?: SemrushSuggestionDetails;
  /** 建议来源：api=拦截到 Semrush 接口；dom=页面侧栏抓取；mixed=两者合并 */
  analysisSource?: 'api' | 'dom' | 'mixed';
  /** 调试：命中的 Semrush API URL */
  apiUrls?: string[];
}

export interface SeoCheckInput {
  content: string;
  /** 主目标关键词 */
  keyword: string;
  /** 一并提交给 Semrush 的推荐/实体关键词（逗号分隔填入 SWA） */
  recommendedKeywords?: string[];
}

export interface ISeoCheckerProvider {
  checkScore(input: SeoCheckInput): Promise<SeoScore>;
}
