/**
 * seo-factory 插件 API 类型。
 */

export type KeywordConflictReason = "exact" | "substring" | "similar";

export interface KeywordCannibalizationWarning {
  code: "KEYWORD_CANNIBALIZATION";
  message: string;
  jobId: string;
  keyword: string;
  status: string;
  reason: KeywordConflictReason;
}

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

export interface SerpOrganicScrapedMeta {
  wordCount: number;
  headings: string[];
  excerpt: string;
  metaDescription?: string;
  scrapedAt: string;
  error?: string;
}

export interface SerpOrganicItem {
  link: string;
  title: string;
  snippet?: string;
  position?: number;
  date?: string;
  scraped?: SerpOrganicScrapedMeta;
}

export interface SerpOrganicFilterMeta {
  total: number;
  kept: number;
  excluded: number;
  articlesOnly: boolean;
  limit: number;
  articleKept?: number;
  backfillKept?: number;
}

export interface SerpCompetitorScrapeMeta {
  requested: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

export interface ArticleJobSerpData {
  organic?: SerpOrganicItem[];
  organicRaw?: SerpOrganicItem[];
  filterMeta?: SerpOrganicFilterMeta;
  competitorScrapeMeta?: SerpCompetitorScrapeMeta;
  fingerprint?: string;
  fromCache?: boolean;
  aiOverview?: unknown;
}

export interface ArticleJobBriefOutlineSection {
  heading: string;
  points?: string[];
}

export interface ArticleJobBriefFeaturedSnippet {
  heading?: string;
  answerMaxWords?: number;
}

export interface ArticleJobBriefData {
  outline?: {
    title?: string;
    outline?: ArticleJobBriefOutlineSection[];
    contentGaps?: string[];
    searchIntent?: string;
    targetWordCount?: number;
    faqCandidates?: string[];
    featuredSnippetTarget?: ArticleJobBriefFeaturedSnippet;
  };
  promptVersion?: string;
  approvalStatus?: "pending" | "approved" | "skipped";
  approvedAt?: string;
  approvedBy?: string;
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
  humanReviewStatus?: "pending" | "approved" | "rejected";
  humanReviewNote?: string;
  humanReviewedAt?: string;
  humanReviewedBy?: string;
}

export type DraftPostSaveAction = "none" | "refresh_local" | "rerun_from_optimizing";

export type DraftResolveStaleAction = "refresh_local" | "rerun_semrush" | "regenerate_export";

export interface DraftStalenessAffected {
  localSeo: boolean;
  semrush: boolean;
  paraphrase: boolean;
  ymyl: boolean;
  export: boolean;
  internalLinks: boolean;
  images: boolean;
}

export interface DraftStaleness {
  contentChanged: boolean;
  titleMetaChanged: boolean;
  invalidatedAt: string;
  invalidatedBy: string;
  affected: DraftStalenessAffected;
  postSaveAction?: DraftPostSaveAction;
}

export interface ManualEditChangeSummary {
  titleChanged: boolean;
  metaChanged: boolean;
  contentDiffStats: {
    added: number;
    removed: number;
    charsBefore: number;
    charsAfter: number;
  };
}

export interface ManualEditHistoryEntry {
  id: string;
  editedAt: string;
  editedBy: string;
  changeSummary: ManualEditChangeSummary;
  snapshot: {
    title?: string;
    metaDescription?: string;
    content: string;
  };
  postSaveAction: DraftPostSaveAction;
  staleness: DraftStalenessAffected;
}

export interface ArticleJobDraftData {
  title?: string;
  content?: string;
  metaDescription?: string;
  promptVersion?: string;
  contentVersion?: number;
  staleness?: DraftStaleness | null;
  manualEditHistory?: ManualEditHistoryEntry[];
  optimizeHistory?: ArticleJobOptimizeRound[];
  internalLinks?: ArticleJobInternalLink[];
  internalLinksApplied?: boolean;
  articleImages?: ArticleJobArticleImage[];
  imagesApplied?: boolean;
  rewritePending?: ArticleJobRewritePending;
  rewriteCandidate?: ArticleJobRewriteCandidate;
  rewriteHistory?: ArticleJobRewriteHistoryEntry[];
  lastRewriteError?: string;
  paraphraseApplied?: boolean;
  paraphraseOriginalContent?: string;
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

export interface PatchArticleDraftPayload {
  title?: string;
  metaDescription?: string;
  content?: string;
  contentVersion: number;
  postSaveAction?: DraftPostSaveAction;
  clientChangeNote?: string;
}

export interface PatchArticleDraftResult {
  id: string;
  traceId: string;
  status: string;
  targetKeyword: string;
  draftData?: ArticleJobDraftData | null;
  localSeoScore?: number | null;
  semrushScore?: number | null;
  outputUrl?: string | null;
  seoCheckData?: ArticleJobSeoCheckData | null;
  updatedAt: string;
  staleness?: DraftStaleness | null;
  contentVersion: number;
}

export interface DraftImageUploadResult {
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface DraftEditHistoryResult {
  items: ManualEditHistoryEntry[];
  contentVersion: number;
}

export interface ArticleJobWorkflowProgress {
  phase: "local-scoring" | "local" | "semrush-check" | "semrush" | "paraphrasing";
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
  | "paraphrasing"
  | "ymyl";

export interface ArticleJobWorkflowMeta {
  failedStep?: ArticleJobWorkflowStep;
}

export interface ArticleJobSeoCheckData {
  workflowProgress?: ArticleJobWorkflowProgress | null;
  workflow?: ArticleJobWorkflowMeta;
  optimizeHistory?: ArticleJobOptimizeRound[];
  optimizationRerun?: {
    reason: "gsc_underperform" | "manual";
    requestedAt: string;
  };
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
      longSentenceSamples?: Array<{ text: string; wordCount: number }>;
      longParagraphSamples?: Array<{ text: string; wordCount: number }>;
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
    lastManualCheckEndedAt?: string;
    recoveredOrphanOptimizing?: boolean;
    cancelled?: boolean;
    manualCheckAt?: string;
    manualCheckPreviousStatus?: string;
    /** 提交给 Semrush 的目标词 + 推荐词 */
    submittedKeywords?: string[];
    optimizeRounds?: number;
    semrushCompetitorWordCount?: number;
    semrushCurrentWordCount?: number;
    semrushReadabilityScore?: number;
  };
  quillbot?: ArticleJobQuillbotResult;
  cmsPublish?: CmsPublishResult;
  ymylReview?: ArticleJobYmylReview;
}

export interface ArticleJobQuillbotResult {
  skipped?: boolean;
  passed?: boolean;
  usedOriginal?: boolean;
  completedAt?: string;
  promptVersion?: string;
  validatePromptVersion?: string;
  changesSummary?: string[];
  warnings?: string[];
  protectedTermCount?: number;
  chunkCount?: number;
  chunksPolished?: number;
  localScoreBefore?: number;
  localScoreAfter?: number;
}

export interface ArticleJobItem {
  id: string;
  traceId: string;
  status: string;
  targetKeyword: string;
  searchIntent?: string | null;
  semrushScore?: number | null;
  localSeoScore?: number | null;
  requiresHumanReview?: boolean;
  ymylReviewCompleted?: boolean;
  reviewPending?: boolean;
  exportReady?: boolean;
  internalLinkCount?: number | null;
  warnings?: KeywordCannibalizationWarning[];
  siteId?: string;
  siteDomain?: string | null;
  siteCmsType?: string | null;
  siteShopifyPublishTarget?: "blog" | "product" | null;
  siteContentProfile?: SiteContentProfile | null;
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
  searchIntent?: string;
  contentForm?: "ARTICLE" | "PRODUCT_ENHANCED" | "FAQ_PAGE";
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

export interface SiteWordPressCmsConfig {
  baseUrl: string;
  username: string;
  defaultStatus: "draft" | "publish";
  hasApplicationPassword: boolean;
}

export interface SiteShopifyCmsConfig {
  shopDomain: string;
  blogId: string;
  productId: string;
  publishTarget: "blog" | "product";
  defaultPublished: boolean;
  hasAccessToken: boolean;
}

export type SiteCmsConfig = SiteWordPressCmsConfig | SiteShopifyCmsConfig;

export function isWordPressCmsConfig(
  cmsType: string | null | undefined,
  config: SiteCmsConfig | null | undefined
): config is SiteWordPressCmsConfig {
  return cmsType === "wordpress" && config != null && "baseUrl" in config;
}

export function isShopifyCmsConfig(
  cmsType: string | null | undefined,
  config: SiteCmsConfig | null | undefined
): config is SiteShopifyCmsConfig {
  return cmsType === "shopify" && config != null && "shopDomain" in config;
}

export interface SiteWorkflowSettings {
  requireBriefApproval?: boolean;
  enableParaphrase?: boolean;
}

/** 管理员配置的搜索结果 / 竞品分析策略（按站点） */
export interface SiteSerpResearchSettings {
  articleLimit?: number;
  articlesOnly?: boolean;
  organicFetchNum?: number;
  minArticleCandidates?: number;
  /** 搜索缓存时长（小时），0 = 不缓存 */
  cacheTtlHours?: number;
}

export interface SiteContentProfile {
  /** 主营行业 / 产品方向（注入 AI Prompt） */
  industry?: string;
  /** 认证资质 */
  certifications?: string;
  /** 起订量与交期说明 */
  moqLeadTime?: string;
  /** 文末询盘引导按钮文案 */
  ctaPrimaryText?: string;
  /** 引导按钮跳转 URL */
  ctaPrimaryUrl?: string;
  /** CTA UTM 来源 */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  /** 核心产品线 / 应用场景 */
  productLines?: string;
  /** 差异化卖点（最多 3 条） */
  differentiators?: string[];
  /** 目标客户类型 */
  targetBuyerType?: string;
  /** 禁用词 / 合规限制 */
  forbiddenTerms?: string[];
  /** 案例 / 客户类型 */
  caseHighlights?: string;
}

export interface SiteItem {
  id: string;
  domain: string;
  brandVoice?: string | null;
  targetMarket?: string | null;
  contentLanguage?: string | null;
  cmsType?: string | null;
  cmsConfig?: SiteCmsConfig | null;
  workflow?: SiteWorkflowSettings;
  contentProfile?: SiteContentProfile;
  serpResearch?: SiteSerpResearchSettings;
  createdAt: string;
}

export interface SitePageItem {
  id: string;
  url: string;
  title: string;
  summary?: string | null;
  keywords: string[];
  primaryKeyword?: string | null;
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

export interface CreateSitePayload {
  domain: string;
  brandVoice?: string;
  targetMarket?: string;
  contentLanguage?: "en" | "zh-CN";
  cmsType?: "wordpress" | "shopify";
  wordpress?: SiteWordPressPayload;
  shopify?: SiteShopifyPayload;
  workflow?: SiteWorkflowSettings;
  contentProfile?: SiteContentProfile;
  serpResearch?: SiteSerpResearchSettings;
}

export interface UpdateSitePayload {
  domain?: string;
  brandVoice?: string;
  targetMarket?: string;
  contentLanguage?: "en" | "zh-CN";
  cmsType?: "wordpress" | "shopify" | null;
  wordpress?: SiteWordPressPayload;
  shopify?: SiteShopifyPayload;
  workflow?: SiteWorkflowSettings;
  contentProfile?: SiteContentProfile;
  serpResearch?: SiteSerpResearchSettings;
}

export interface SiteWordPressPayload {
  baseUrl: string;
  username: string;
  applicationPassword?: string;
  defaultStatus?: "draft" | "publish";
}

export interface SiteShopifyPayload {
  shopDomain: string;
  accessToken?: string;
  blogId?: string;
  productId?: string;
  publishTarget?: "blog" | "product";
  defaultPublished?: boolean;
}

export interface CmsPublishResultBase {
  postId: number | null;
  postUrl: string | null;
  status: string;
  publishedAt: string;
  lastError?: string;
  attemptCount?: number;
}

export interface WordPressCmsPublishResult extends CmsPublishResultBase {
  provider: "wordpress";
  wpStatusRequested: "draft" | "publish";
}

export interface ShopifyCmsPublishResult extends CmsPublishResultBase {
  provider: "shopify";
  publishTarget?: "blog" | "product";
  publishedRequested: boolean;
  blogId?: string;
  productId?: string;
}

export type CmsPublishResult = WordPressCmsPublishResult | ShopifyCmsPublishResult;

export interface SeoFactoryProjectStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  queuedJobs: number;
  optimizingJobs: number;
  pendingBriefCount: number;
  pendingPublishCount: number;
  cmsPublishFailedCount: number;
  pendingReviewCount: number;
  staleDraftCount: number;
  siteCount: number;
  sitesMissingProfileCount: number;
  gscPendingSyncCount: number;
  gscStaleSyncCount: number;
  gscUnderperformingCount: number;
  gscUnderperformingJobs: Array<{
    jobId: string;
    keyword: string;
    page: string;
    impressions: number;
    clicks: number;
    position: number;
  }>;
  keywordTotalCount: number;
  keywordQueueableCount: number;
  keywordUnclusteredCount: number;
}

export interface ShopifyBlogItem {
  id: string;
  title: string;
  handle: string;
}

export interface ShopifyProductItem {
  id: string;
  title: string;
  handle: string;
  status: string;
}
