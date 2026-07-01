/** M7 原创表达优化：分块阈值与回归门禁 */

/** 超过此字符数且 H2 足够多时分块润色 */
export const PARAPHRASE_CHUNK_MIN_CHARS = 5000;

/** 分块润色至少需要的 H2 数量 */
export const PARAPHRASE_CHUNK_MIN_H2 = 3;

/** 润色后本地预检分允许的最大下降值 */
export const PARAPHRASE_LOCAL_SCORE_MAX_DROP = 5;

/** 分块润色：正文（去标题/配图后）低于此字符数则跳过 LLM */
export const PARAPHRASE_MIN_PROSE_CHARS = 350;

/** 分块润色：篇幅门禁（比全文更严） */
export const PARAPHRASE_CHUNK_LENGTH_MIN = 0.92;
export const PARAPHRASE_CHUNK_LENGTH_MAX = 1.08;

/** 分块 LLM 成功率低于此比例时记录警告（不再整篇回退） */
export const PARAPHRASE_MIN_CHUNK_SUCCESS_RATIO = 0.25;

/** 全文改动低于此比例且程序化门禁通过时，跳过 LLM 语义复检 */
export const PARAPHRASE_MAX_CHANGE_RATIO_FOR_VALIDATE_SKIP = 0.12;
