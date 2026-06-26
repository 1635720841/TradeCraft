/**
 * SEO 评分门槛
 * - 本地分：预检（关键词/SERP/结构/可读性启发式），进门闸；Semrush 阶段不再约束回滚
 * - Semrush 分：终检权威分，任务是否通过及 Semrush 优化验收均以此为准
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
export const SEMRUSH_MAX_OPTIMIZE_ROUNDS = 5;

/** 距 Semrush 门槛在此分差内仍追加改写（如 8.8/9.0） */
export const SEMRUSH_NEAR_MISS_MARGIN = 0.2;

/** Semrush 接近门槛时的额外改写轮次 */
export const SEMRUSH_NEAR_MISS_EXTRA_ROUNDS = 2;

/** Semrush 失败重试时，在已用满常规轮次后追加的改写轮次 */
export const SEMRUSH_RETRY_EXTRA_ROUNDS = 4;

/** 极接近 Semrush 及格线（如 8.9/9.0）时追加的改写轮次 */
export const SEMRUSH_ULTRA_NEAR_MISS_MARGIN = 0.1;

/** 极接近及格线时的额外改写轮次 */
export const SEMRUSH_ULTRA_NEAR_MISS_EXTRA_ROUNDS = 2;

/** Semrush 终检 RPA 分数波动容差（回滚判定） */
export const SEMRUSH_SCORE_ROLLBACK_TOLERANCE = 0.05;

/** ≥此分启用手术式/轻量优化，禁止整篇 rewrite（8.7+） */
export const SEMRUSH_SURGICAL_MODE_THRESHOLD = 8.7;

/** Semrush 词数缺口达到此值时触发确定性 FAQ 增补 */
export const SEMRUSH_WORD_GAP_INJECT_MIN = 55;

/** Semrush Overall Score 通过线 */
export const SEMRUSH_PASS_THRESHOLD = 9.0;

/** 本地对齐 Sem：预测分距通过线在此范围内仍放行进 Semrush RPA（终检仍以真分为准） */
export const SCORE_CALIBRATION_LOCAL_ALIGN_SOFT_PASS_MARGIN = 0.78;

/** 本地分已达标时：预测分距通过线在此范围内仍放行 RPA（如本地 96 + 预测 8.17） */
export const SCORE_CALIBRATION_HIGH_LOCAL_SOFT_PASS_MARGIN = 0.85;

/** 校准模式：规则分已达 localPassThreshold 时，预测分未达标仍交 Semrush RPA 终检（Sem 为权威） */
export const SCORE_CALIBRATION_DEFER_TO_SEMRUSH_WHEN_LOCAL_PASSED = true;

/** 校准模式：预测分微幅回退仍接受候选（Flesch/SERP 有进展） */
export const SCORE_CALIBRATION_PREDICTED_ACCEPT_TOLERANCE = 0.05;

/** 降频 RPA：校准模型 MAE 须低于此值 */
export const SCORE_CALIBRATION_REDUCE_RPA_MAX_MODEL_MAE = 0.35;

/** 降频 RPA：预测分低于 best 超过此值则跳过 RPA 直接回滚 */
export const SCORE_CALIBRATION_SKIP_REJECT_DELTA = 0.15;

/** 单任务最多保留校准影子日志条数 */
export const SCORE_CALIBRATION_SHADOW_MAX = 40;

/** Semrush SWA 提交词表下限（正文已覆盖短语） */
export const SEMRUSH_SUBMITTED_KEYWORD_MIN = 8;

/** Semrush SWA 提交词表上限（少而准，对齐「从文本中提取」路径） */
export const SEMRUSH_SUBMITTED_KEYWORD_MAX = 12;
