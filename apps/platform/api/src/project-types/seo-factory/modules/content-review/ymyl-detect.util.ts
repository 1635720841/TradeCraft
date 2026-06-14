/**
 * YMYL（Your Money Your Life）敏感内容检测纯函数。
 *
 * 边界：
 * - 不负责：持久化（ContentReviewService）
 *
 * 入口：
 * - detectYmylContent
 * - canPublishArticle
 */

export interface YmylReviewResult {
  requires_human_review: boolean;
  categories: string[];
  matchedSignals: string[];
  reviewedAt: string;
}

interface YmylCategoryRule {
  id: string;
  label: string;
  patterns: RegExp[];
}

const YMYL_RULES: YmylCategoryRule[] = [
  {
    id: 'medical',
    label: '医疗健康',
    patterns: [
      /\b(cancer|diabetes|depression|anxiety|pregnancy|symptom|diagnos|prescription|medicine|medication|dosage|clinical trial|fda approved)\b/i,
      /医疗|健康|疾病|症状|诊断|处方|用药|剂量|治疗|手术|怀孕|抑郁|焦虑|癌症|糖尿病|疫苗/i,
    ],
  },
  {
    id: 'finance',
    label: '金融投资',
    patterns: [
      /\b(investment advice|financial advisor|stock pick|trading strategy|mortgage rate|loan approval|credit score|tax deduction|retirement fund|crypto invest)\b/i,
      /投资|理财|股票|基金|贷款|抵押|信贷|保险|税务|退休|理财建议|收益率|加密货币/i,
    ],
  },
  {
    id: 'legal',
    label: '法律合规',
    patterns: [
      /\b(legal advice|attorney|lawsuit|litigation|court ruling|contract law|immigration law|criminal charge)\b/i,
      /法律建议|律师|诉讼|起诉|法院|合同|合规|刑事|移民法/i,
    ],
  },
  {
    id: 'safety',
    label: '安全决策',
    patterns: [
      /\b(medical emergency|suicide|self-harm|child safety|food safety recall|structural failure)\b/i,
      /紧急医疗|自杀|自残|儿童安全|食品安全|结构安全/i,
    ],
  },
];

function collectSignals(text: string): Map<string, string[]> {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return new Map();

  const hits = new Map<string, string[]>();
  for (const rule of YMYL_RULES) {
    for (const pattern of rule.patterns) {
      const match = normalized.match(pattern);
      if (match?.[0]) {
        const list = hits.get(rule.id) ?? [];
        const signal = match[0].trim().slice(0, 80);
        if (!list.includes(signal)) {
          list.push(signal);
        }
        hits.set(rule.id, list);
      }
    }
  }
  return hits;
}

export function detectYmylContent(input: {
  targetKeyword: string;
  briefText?: string;
  content?: string;
  reviewedAt?: string;
}): YmylReviewResult {
  const corpus = [input.targetKeyword, input.briefText ?? '', input.content ?? ''].join('\n');
  const hits = collectSignals(corpus);

  const categories: string[] = [];
  const matchedSignals: string[] = [];

  for (const rule of YMYL_RULES) {
    const signals = hits.get(rule.id);
    if (!signals?.length) continue;
    categories.push(rule.id);
    matchedSignals.push(...signals.map((signal) => `${rule.label}: ${signal}`));
  }

  const requires_human_review = categories.length > 0;

  return {
    requires_human_review,
    categories,
    matchedSignals: [...new Set(matchedSignals)].slice(0, 12),
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
  };
}

/** M10 导出前校验：YMYL 且需人工审核时禁止生成可发布 HTML */
export function canPublishArticle(seoCheckData: unknown): boolean {
  const record = (seoCheckData ?? {}) as {
    ymylReview?: { requires_human_review?: boolean };
  };
  return record.ymylReview?.requires_human_review !== true;
}

export function getYmylReview(seoCheckData: unknown): YmylReviewResult | null {
  const record = (seoCheckData ?? {}) as { ymylReview?: YmylReviewResult };
  return record.ymylReview ?? null;
}

export function isYmylReviewCompleted(seoCheckData: unknown): boolean {
  return Boolean(getYmylReview(seoCheckData)?.reviewedAt);
}
