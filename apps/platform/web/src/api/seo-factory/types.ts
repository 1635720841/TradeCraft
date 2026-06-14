/**
 * seo-factory 插件 API 类型。
 */

export interface WmApiResponse<T> {
  data: T;
  meta?: {
    traceId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
    };
  };
}

export interface SerpOrganicItem {
  link: string;
  title: string;
  snippet?: string;
  position?: number;
  date?: string;
}

export interface SerpOrganicFilterMeta {
  total: number;
  kept: number;
  excluded: number;
  articlesOnly: boolean;
  limit: number;
}

export interface ArticleJobSerpData {
  organic?: SerpOrganicItem[];
  organicRaw?: SerpOrganicItem[];
  filterMeta?: SerpOrganicFilterMeta;
  fingerprint?: string;
  aiOverview?: unknown;
}

export interface ArticleJobBriefOutlineSection {
  heading: string;
  points?: string[];
}

export interface ArticleJobBriefData {
  outline?: {
    title?: string;
    outline?: ArticleJobBriefOutlineSection[];
    contentGaps?: string[];
    searchIntent?: string;
    targetWordCount?: number;
  };
  promptVersion?: string;
}

export interface ArticleJobOptimizeRoundBreakdown {
  keywordCoverage: number;
  serpTermAlignment: number;
  structure: number;
  readability: number;
  contentDepth: number;
}

export interface ArticleJobOptimizeRound {
  phase: "local" | "semrush";
  round: number;
  kind?: "baseline" | "optimize";
  promptVersion?: string;
  changesSummary?: string[];
  warnings?: string[];
  optimizedAt: string;
  scoreBefore?: number;
  scoreAfter?: number;
  localScoreAfter?: number;
  breakdownAfter?: ArticleJobOptimizeRoundBreakdown;
  /** 改分下降，已回滚到历史最优稿 */
  rolledBack?: boolean;
  /** 回滚时候选稿主分（本地轮=本地分，Semrush 轮=Semrush 分） */
  candidateScoreAfter?: number;
  /** Semrush 轮回滚时候选稿本地分 */
  candidateLocalScoreAfter?: number;
  /** 回滚原因 */
  rollbackReason?: "score_regressed" | "local_below_threshold" | "both";
}

export type ArticleJobRewriteMode = "suggestions" | "instruction";

export interface ArticleJobRewritePending {
  startedAt: string;
  mode: ArticleJobRewriteMode;
  instruction?: string;
}

export interface ArticleJobRewriteCandidate {
  content: string;
  title?: string;
  metaDescription?: string;
  changesSummary?: string[];
  warnings?: string[];
  promptVersion: string;
  generatedAt: string;
  mode: ArticleJobRewriteMode;
  instruction?: string;
}

export interface ArticleJobRewriteHistoryEntry {
  id: string;
  mode: ArticleJobRewriteMode;
  status: "completed" | "discarded" | "accepted";
  instruction?: string;
  changesSummary?: string[];
  createdAt: string;
}

export interface ArticleJobInternalLink {
  anchorText: string;
  targetUrl: string;
  pageType: string;
  confidence: number;
  matchReason: string;
  insertAfterHeading?: string;
}

export interface ArticleJobArticleImage {
  alt: string;
  url: string;
  source: "bfl";
  insertAfterHeading?: string;
}

export interface ArticleJobYmylReview {
  requires_human_review: boolean;
  categories: string[];
  matchedSignals: string[];
  reviewedAt: string;
}

export interface ArticleJobDraftData {
  title?: string;
  content?: string;
  metaDescription?: string;
  promptVersion?: string;
  optimizeHistory?: ArticleJobOptimizeRound[];
  internalLinks?: ArticleJobInternalLink[];
  internalLinksApplied?: boolean;
  articleImages?: ArticleJobArticleImage[];
  imagesApplied?: boolean;
  rewritePending?: ArticleJobRewritePending;
  rewriteCandidate?: ArticleJobRewriteCandidate;
  rewriteHistory?: ArticleJobRewriteHistoryEntry[];
  lastRewriteError?: string;
}

export interface RewriteArticleJobPayload {
  mode: ArticleJobRewriteMode;
  instruction?: string;
  suggestions?: string[];
  options?: {
    keepTitleMeta?: boolean;
    rerunLocalSeo?: boolean;
  };
}

export interface ArticleJobWorkflowProgress {
  phase: "local-scoring" | "local" | "semrush-check" | "semrush";
  round?: number;
  maxRounds?: number;
  message: string;
  localScore?: number;
  semrushScore?: number;
  updatedAt: string;
}

export type ArticleJobWorkflowStep =
  | "serp"
  | "brief"
  | "draft"
  | "linking"
  | "images"
  | "optimizing"
  | "ymyl";

export interface ArticleJobWorkflowMeta {
  failedStep?: ArticleJobWorkflowStep;
}

export interface ArticleJobSeoCheckData {
  workflowProgress?: ArticleJobWorkflowProgress | null;
  workflow?: ArticleJobWorkflowMeta;
  optimizeHistory?: ArticleJobOptimizeRound[];
  local?: {
    score: number;
    breakdown?: {
      keywordCoverage: number;
      serpTermAlignment: number;
      structure: number;
      readability?: number;
      contentDepth: number;
    };
    suggestions?: string[];
    metrics?: {
      wordCount: number;
      keywordDensity: number;
      matchedSerpTerms: number;
      totalSerpTerms: number;
      h2Count: number;
      longSentencesOver22?: number;
      longParagraphsOver80?: number;
      passiveVoiceHits?: number;
    };
    optimizeRounds?: number;
    /** 是否已达本地预检门槛（≥95），通过后才可 Semrush 终检 */
    passed?: boolean;
    passedAt?: string;
    refreshedAt?: string;
  };
  semrush?: {
    skipped?: boolean;
    overall?: number;
    suggestions?: string[];
    passed?: boolean;
    node?: string;
    nodeLabel?: string;
    suggestionDetails?: {
      readability?: string[];
      seo?: string[];
      tone?: string[];
      originality?: string[];
    };
    analysisSource?: 'api' | 'dom' | 'mixed';
    apiUrls?: string[];
    pending?: {
      startedAt: string;
      previousStatus: string;
    };
    lastManualCheckError?: string;
    cancelled?: boolean;
    manualCheckAt?: string;
    /** 提交给 Semrush 的目标词 + 推荐词 */
    submittedKeywords?: string[];
    optimizeRounds?: number;
    semrushCompetitorWordCount?: number;
    semrushCurrentWordCount?: number;
    semrushReadabilityScore?: number;
  };
  ymylReview?: ArticleJobYmylReview;
}

export interface ArticleJobItem {
  id: string;
  traceId: string;
  status: string;
  targetKeyword: string;
  semrushScore?: number | null;
  localSeoScore?: number | null;
  requiresHumanReview?: boolean;
  ymylReviewCompleted?: boolean;
  internalLinkCount?: number | null;
  seoCheckData?: ArticleJobSeoCheckData | null;
  outputUrl?: string | null;
  errorMessage?: string | null;
  serpData?: ArticleJobSerpData | null;
  briefData?: ArticleJobBriefData | null;
  draftData?: ArticleJobDraftData | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateArticleJobPayload {
  siteId: string;
  targetKeyword: string;
  contentLanguage?: "en" | "zh-CN";
  serpArticleLimit?: number;
  serpArticlesOnly?: boolean;
}

export interface DiscoveredSeoArticle {
  url: string;
  keyword: string;
}

export interface CreateBatchArticleJobsPayload {
  siteId: string;
  source: "site-crawl" | "keywords";
  keywords?: string[];
  limit?: number;
  seoArticlesOnly?: boolean;
  contentLanguage?: "en" | "zh-CN";
  serpArticleLimit?: number;
  serpArticlesOnly?: boolean;
}

export interface BatchArticleJobsResult {
  created: number;
  skipped: number;
  jobs: ArticleJobItem[];
}

export interface SiteItem {
  id: string;
  domain: string;
  brandVoice?: string | null;
  targetMarket?: string | null;
  contentLanguage?: string | null;
  createdAt: string;
}

export interface SitePageItem {
  id: string;
  url: string;
  title: string;
  summary?: string | null;
  keywords: string[];
  pageType: string;
  businessValue: number;
  lastUpdated?: string | null;
  source: string;
  updatedAt: string;
}

export interface SitePageSyncResult {
  discovered: number;
  upserted: number;
}
