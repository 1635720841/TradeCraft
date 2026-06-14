/**
 * SEO 评分门槛
 * - 本地分：预检（关键词/SERP/结构/可读性启发式），规则对齐 Semrush SWA
 * - Semrush 分：终检权威分，任务是否通过以此为准
 */

/** 本地预检通过线（进门闸；终检以 Semrush ≥9.0 为准） */
export const LOCAL_SEO_PASS_THRESHOLD = 95;

/** 本地优化最大轮次 */
export const LOCAL_SEO_MAX_OPTIMIZE_ROUNDS = 5;

/** 距门槛在此分差内仍追加改写（如 94/95） */
export const LOCAL_SEO_NEAR_MISS_MARGIN = 5;

/** 接近门槛时的额外改写轮次 */
export const LOCAL_SEO_NEAR_MISS_EXTRA_ROUNDS = 3;

/** 失败重试时，在已用满常规轮次后追加的改写轮次 */
export const LOCAL_SEO_RETRY_EXTRA_ROUNDS = 3;

/** Semrush 未达标时，按侧栏建议改写初稿的最大轮次 */
export const SEMRUSH_MAX_OPTIMIZE_ROUNDS = 4;

/** 距 Semrush 门槛在此分差内仍追加改写（如 8.8/9.0） */
export const SEMRUSH_NEAR_MISS_MARGIN = 0.2;

/** Semrush 接近门槛时的额外改写轮次 */
export const SEMRUSH_NEAR_MISS_EXTRA_ROUNDS = 2;

/** Semrush 失败重试时，在已用满常规轮次后追加的改写轮次 */
export const SEMRUSH_RETRY_EXTRA_ROUNDS = 2;

/** Semrush Overall Score 通过线 */
export const SEMRUSH_PASS_THRESHOLD = 9.0;
