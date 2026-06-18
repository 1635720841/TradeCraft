export interface SemrushSuggestionDetails {
  readability?: string[];
  seo?: string[];
  tone?: string[];
  originality?: string[];
}

export type SemrushIssueRule =
  | 'passive_voice'
  | 'complex_word'
  | 'casual_sentence'
  | 'filler_phrase'
  | 'long_paragraph'
  | 'keyword'
  | 'other';

/** SWA 侧栏结构化改动点（语气/可读性等展开「展示更多」后解析） */
export interface SemrushActionableIssue {
  category: keyof SemrushSuggestionDetails;
  rule: SemrushIssueRule;
  /** 侧栏规则标题，如「考虑使用主动语态」 */
  label: string;
  /** 需改写的原句（完整或截断） */
  quotes?: string[];
  /** 复杂词 / 推荐词 Tag */
  terms?: string[];
}

export interface SeoScore {
  overall: number;
  suggestions: string[];
  /** Semrush API 返回的推荐关键词（供下一轮改写与 SWA 目标） */
  semrushRecommendedKeywords?: string[];
  /** Semrush RPA 实际评测的线路信息（节点键+节点标签） */
  semrushEvaluationRoute?: string;
  /** Semrush RPA 实际评测的文章指纹（标题/首行+词数），用于前端展示“评的哪篇” */
  semrushEvaluationContentFingerprint?: string;
  /** Semrush API / 提交给 SWA 的目标关键词全集 */
  semrushTargetKeywords?: string[];
  /** 正文中未出现的 SWA 目标关键词（侧栏灰色 Tag） */
  semrushMissingTargetKeywords?: string[];
  /** 正文中未出现的 SWA 推荐关键词（侧栏灰色 Tag） */
  semrushMissingRecommendedKeywords?: string[];
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
  /** 结构化改动点：被动句、随意句、复杂词等 */
  actionableIssues?: SemrushActionableIssue[];
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
  /** 若提供，优先作为 SWA 目标词表（正文已覆盖的 8–12 个短语） */
  submittedKeywords?: string[];
  /** 优先固定的 3ue 节点键（如「节点14」）；用于同一 job 的多轮评测保持一致 */
  preferredNodeKey?: string;
}

export interface ISeoCheckerProvider {
  checkScore(input: SeoCheckInput): Promise<SeoScore>;
}
