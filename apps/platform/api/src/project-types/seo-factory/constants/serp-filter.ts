/** SERP 竞品文章默认条数上限 */
export const DEFAULT_SERP_ARTICLE_LIMIT = 5;

/** SERP 竞品文章条数硬上限 */
export const MAX_SERP_ARTICLE_LIMIT = 20;

/** 向 Serper 请求的有机结果条数（过滤前尽量多拿，避免筛完只剩几条） */
export const SERPER_ORGANIC_NUM = 30;

/** Serper 有机结果条数下限 / 上限（管理员可配） */
export const MIN_SERPER_ORGANIC_NUM = 10;
export const MAX_SERPER_ORGANIC_NUM = 50;

/** 博客类竞品不足该数时，自动从其余搜索结果中回补（仍排除电商/产品页等） */
export const MIN_SERP_ARTICLE_CANDIDATES = 3;

/** 搜索缓存默认时长（小时） */
export const DEFAULT_SERP_CACHE_TTL_HOURS = 24;

/** 搜索缓存时长下限 / 上限（小时）；0 = 不缓存 */
export const MIN_SERP_CACHE_TTL_HOURS = 0;
export const MAX_SERP_CACHE_TTL_HOURS = 168;

/** 站点采集 SEO 文章默认条数 */
export const DEFAULT_SITE_CRAWL_LIMIT = 20;

/** 站点采集 SEO 文章硬上限 */
export const MAX_SITE_CRAWL_LIMIT = 50;

/** 批量创建任务默认条数 */
export const DEFAULT_BATCH_JOB_LIMIT = 5;

/** 批量创建任务硬上限 */
export const MAX_BATCH_JOB_LIMIT = 20;
