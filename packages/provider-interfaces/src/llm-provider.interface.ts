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
  /** 本地 Markdown 扩写目标（略高于 SWA 竞品标杆） */
  semrushLocalExpandWordTarget?: number;
  /** 正文本地词数（与 SWA 统计对照） */
  localWordCount?: number;
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
  /** 校准对齐：SERP 实体未满时优先补词 */
  serpPriority?: boolean;
  /** 校准对齐：Flesch 低于目标时优先提可读性指数 */
  fleschPriority?: boolean;
  /** 校准对齐：难读句 >2 时外科式改写指定原句 */
  hardSentencePriority?: boolean;
  /** 校准对齐：标题超长/词数不当时优先改 H1 */
  titlePriority?: boolean;
  /** 校准对齐：超竞品篇幅时优先 trim，禁止 inject FAQ */
  wordCountTrimPriority?: boolean;
  /** 距 Semrush 词数目标缺 >100 词时优先扩写 */
  wordCountExpandPriority?: boolean;
  /** 当前标题（draft.title 或 H1，供标题优先轮注入 Prompt） */
  articleTitle?: string;
  /** 长句/长段诊断（英文，注入 Prompt） */
  readabilityAudit?: string;
  pointsToGo?: number;
  /** 精确提分计划（英文） */
  scoreGapPlan?: string;
  /** 关键词与 SERP 实体已满分，本轮禁止扩写/凑词 */
  contentCoverageMaxed?: boolean;
  /** SERP 实体已 25/25，禁止再凑实体句 */
  serpCoverageMaxed?: boolean;
  /** 关键词覆盖未满分，本轮优先调密度/开篇/H2 */
  keywordDensityFocus?: boolean;
  /** 可读性优化轮须保留的已命中 SEO 短语（exact match） */
  protectedSeoPhrases?: string[];
  /** 本地对齐 Sem：优化目标为预测 Semrush 分（0–10），localScoreTarget 仍为 0–100 参考 */
  calibratedLocalAlign?: boolean;
  predictedSemrush?: number;
  predictedSemrushTarget?: number;
  /** 调试字段：Semrush 本轮路由动作 */
  roundAction?: 'semrush_keyword_first' | 'semrush_surgical' | 'semrush_optimize';
  /** 调试字段：Semrush 本轮关键词批次 */
  keywordBatch?: string[];
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

export interface ScoreReverseAnalysisVariantInput {
  key: string;
  label: string;
  medianScore: number | null;
  standardDeviation: number | null;
  deltaFromBaseline: number | null;
  pairedDeltaMedian?: number | null;
  pairedDeltaStandardDeviation?: number | null;
  pairedSampleCount?: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  trialCount: number;
  warnings: string[];
  observation?: string;
}

export interface ScoreReverseAnalysisInput {
  experimentName: string;
  targetKeyword: string;
  submittedKeywords: string[];
  baselineSpread?: number | null;
  baselineDriftDetected?: boolean;
  variants: ScoreReverseAnalysisVariantInput[];
}

export interface ScoreReverseAnalysisFinding {
  factorKey: string;
  title: string;
  evidence: string;
  interpretation: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScoreReverseAnalysisNextAction {
  factorKey?: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ScoreReverseAnalysisOutput {
  summary: string;
  findings: ScoreReverseAnalysisFinding[];
  limitations: string[];
  nextActions: ScoreReverseAnalysisNextAction[];
  promptVersion: string;
}

export interface ILLMProvider {
  generateBrief(input: BriefInput): Promise<BriefOutput>;
  generateDraft(input: DraftInput): Promise<DraftOutput>;
  generateOptimize(input: OptimizeInput): Promise<OptimizeOutput>;
  generateRewrite(input: RewriteInput): Promise<RewriteOutput>;
  generateKeywordSeeds(input: KeywordSeedInput): Promise<KeywordSeedOutput>;
  analyzeScoreReverseExperiment(input: ScoreReverseAnalysisInput): Promise<ScoreReverseAnalysisOutput>;
}
