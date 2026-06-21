/**
 * 评分校准训练卫生：标签复核提示、项目内离群检测（不绑定行业）。
 *
 * 边界：
 * - 不负责：HTTP / DB
 * - 不负责：模型训练
 */

/** 手动录入：朴素映射与 Semrush 真分差距超过此值则提示复核 */
export const SCORE_CALIBRATION_LABEL_WARN_NAIVE_ABS_ERROR = 1;

/** 至少多少条配对后才做离群检测 */
export const SCORE_CALIBRATION_OUTLIER_MIN_CORPUS = 5;

/** 与同项目其他样本的最大关键词 Jaccard 低于此值则标为可能离群 */
export const SCORE_CALIBRATION_OUTLIER_MAX_SIMILARITY = 0.12;

export interface CalibrationPairOutlierFlag {
  index: number;
  maxSimilarity: number;
  reason: string;
}

function tokenizeCalibrationText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

/** 关键词 token Jaccard 相似度（0–1） */
export function calibrationKeywordSimilarity(a: string, b: string): number {
  const setA = new Set(tokenizeCalibrationText(a));
  const setB = new Set(tokenizeCalibrationText(b));
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 相对本 project 现有关键词语料检测离群样本（如 BMS 与医疗混在同一项目）。
 * 样本数不足时不标记，避免误报。
 */
export function detectCalibrationPairOutliers(keywords: string[]): CalibrationPairOutlierFlag[] {
  if (keywords.length < SCORE_CALIBRATION_OUTLIER_MIN_CORPUS) {
    return [];
  }

  const flags: CalibrationPairOutlierFlag[] = [];
  for (let index = 0; index < keywords.length; index += 1) {
    let maxSimilarity = 0;
    for (let other = 0; other < keywords.length; other += 1) {
      if (other === index) continue;
      maxSimilarity = Math.max(
        maxSimilarity,
        calibrationKeywordSimilarity(keywords[index], keywords[other]),
      );
    }
    if (maxSimilarity < SCORE_CALIBRATION_OUTLIER_MAX_SIMILARITY) {
      const pct = Math.round(maxSimilarity * 100);
      flags.push({
        index,
        maxSimilarity,
        reason: `与同项目其他样本关键词重叠偏低（${pct}%），可能不适合混入本模型，建议排除或单独建项目`,
      });
    }
  }
  return flags;
}

/** 手动录入 Semrush 真分与本地/10 差距过大时的复核文案 */
export function buildCalibrationLabelWarning(
  naiveMapped: number,
  semrushOverall: number,
): string | null {
  const absError = Math.round(Math.abs(naiveMapped - semrushOverall) * 100) / 100;
  if (absError < SCORE_CALIBRATION_LABEL_WARN_NAIVE_ABS_ERROR) {
    return null;
  }
  return `本地/10（${naiveMapped}）与填写的 Semrush 分（${semrushOverall}）相差 ${absError.toFixed(2)}，请确认正文与真分为同一次检测`;
}
