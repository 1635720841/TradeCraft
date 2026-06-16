export interface BriefInput {
  keyword: string;
  serpContext: unknown;
  brandVoice?: string;
  contentLanguage?: string;
  searchIntent?: string;
  intentGuidelines?: string;
  contentForm?: string;
  contentFormGuidelines?: string;
  clusterContext?: string;
}

export interface BriefOutput {
  outline: unknown;
  promptVersion: string;
}

export interface DraftInput {
  keyword: string;
  brief: BriefOutput;
  brandVoice?: string;
  contentLanguage?: string;
  searchIntent?: string;
  intentGuidelines?: string;
  contentForm?: string;
  contentFormGuidelines?: string;
  clusterContext?: string;
}

export interface DraftOutput {
  title?: string;
  content: string;
  metaDescription?: string;
  promptVersion: string;
}

export interface OptimizeInput {
  keyword: string;
  content: string;
  suggestions: string[];
  /** 本地评分建议补充的实体词，须在正文中自然覆盖 */
  recommendedKeywords?: string[];
  brandVoice?: string;
  contentLanguage?: string;
  /** local=本地 TF-IDF 评分；semrush=Semrush SWA 侧栏建议 */
  optimizePhase?: 'local' | 'semrush';
  /** Brief 结构摘要（outline、contentGaps、writingGuidelines） */
  briefSummary?: string;
  targetWordCount?: number;
  searchIntent?: string;
  /** Semrush 阶段：竞品标杆词数，侧栏「比竞争对手长」时须压到此范围 */
  semrushCompetitorWordCount?: number;
  semrushCurrentWordCount?: number;
  semrushReadabilityScore?: number;
  /** 本地预检当前分与明细，供 LLM 对症提分 */
  localScore?: number;
  localScoreTarget?: number;
  localScoreBreakdown?: string;
  /** 同阶段历史轮次摘要（失败改法勿重复） */
  optimizeHistoryContext?: string;
  /** 本轮仅聚焦的评分维度（1–2 项） */
  focusDimensions?: string;
  /** 接近门槛且可读性为瓶颈时，本轮强制优先拆句 */
  readabilityPriority?: boolean;
  /** 长句/长段诊断（英文，注入 Prompt） */
  readabilityAudit?: string;
  pointsToGo?: number;
  /** 精确提分计划（英文） */
  scoreGapPlan?: string;
  /** 关键词与 SERP 实体已满分，本轮禁止扩写/凑词 */
  contentCoverageMaxed?: boolean;
}

export interface OptimizeOutput {
  content: string;
  promptVersion: string;
  changesSummary?: string[];
  warnings?: string[];
}

export interface RewriteInput {
  keyword: string;
  content: string;
  instruction: string;
  brandVoice?: string;
  contentLanguage?: string;
  briefSummary?: string;
  targetWordCount?: number;
  searchIntent?: string;
}

export interface RewriteOutput {
  content: string;
  promptVersion: string;
  changesSummary?: string[];
  warnings?: string[];
}

export interface KeywordSeedItem {
  keyword: string;
  intent: 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'BRAND' | 'COMPETITOR';
  businessValueScore: number;
  contentFitScore: number;
  rationale?: string;
}

export interface KeywordSeedInput {
  siteDomain: string;
  brandVoice?: string;
  targetMarket?: string;
  contentLanguage?: string;
  count?: number;
  topicHint?: string;
}

export interface KeywordSeedOutput {
  keywords: KeywordSeedItem[];
  promptVersion: string;
}

export interface ILLMProvider {
  generateBrief(input: BriefInput): Promise<BriefOutput>;
  generateDraft(input: DraftInput): Promise<DraftOutput>;
  generateOptimize(input: OptimizeInput): Promise<OptimizeOutput>;
  generateRewrite(input: RewriteInput): Promise<RewriteOutput>;
  generateKeywordSeeds(input: KeywordSeedInput): Promise<KeywordSeedOutput>;
}
