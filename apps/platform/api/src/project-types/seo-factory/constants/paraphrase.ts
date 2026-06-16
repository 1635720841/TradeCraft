/** M7 原创表达优化：分块阈值与回归门禁 */

/** 超过此字符数且 H2 足够多时分块润色 */
export const PARAPHRASE_CHUNK_MIN_CHARS = 5000;

/** 分块润色至少需要的 H2 数量 */
export const PARAPHRASE_CHUNK_MIN_H2 = 3;

/** 润色后本地预检分允许的最大下降值 */
export const PARAPHRASE_LOCAL_SCORE_MAX_DROP = 5;
