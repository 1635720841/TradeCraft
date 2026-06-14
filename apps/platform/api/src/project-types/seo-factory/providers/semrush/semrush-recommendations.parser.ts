import type { SemrushSuggestionDetails } from '@wm/provider-interfaces';

export interface SemrushRecommendationsPayload {
  data_ready?: boolean;
  score?: number | null;
  score_quality?: string | null;
  readability?: number | null;
  original_readability?: number | null;
  length?: number | null;
  original_length?: number | null;
  title?: string | null;
  keywords?: Array<{ keyword?: string; frequency?: string; difficulty?: number }>;
  recommended_keywords?: Array<{ keyword?: string; frequency?: string; difficulty?: number }>;
  formality_level?: string | null;
}

function isWeakScore(body: SemrushRecommendationsPayload): boolean {
  if (body.score_quality === 'bad') return true;
  if (typeof body.score === 'number' && body.score > 0 && body.score < 0.7) return true;
  return false;
}

/** 与 Semrush 侧栏一致的规则化建议（由 metrics 推导，非 API 逐条返回） */
function synthesizeReadabilityTips(body: SemrushRecommendationsPayload): string[] {
  const tips: string[] = [];
  const readability = body.readability ?? body.original_readability;

  if (typeof readability === 'number' && readability < 70) {
    if (readability < 65) {
      tips.push('您的文本似乎过于复杂。请考虑简化文本。');
    }
    tips.push('拆分长段。');
    tips.push('重写难以阅读的句子。');
    tips.push('考虑使用主动语态。');
    if (readability < 65) {
      tips.push('替换太过复杂的词语。');
    }
  }

  const targetWords = body.length;
  const currentWords = body.original_length ?? body.length;
  if (
    typeof targetWords === 'number' &&
    typeof currentWords === 'number' &&
    currentWords > targetWords + 50
  ) {
    tips.push('您的文本比表现最佳的竞争对手的文本长。请考虑缩短文本。');
  } else if (
    typeof targetWords === 'number' &&
    typeof currentWords === 'number' &&
    targetWords > currentWords + 100
  ) {
    tips.push(`请考虑撰写更多文本。当前词语数为 ${currentWords}，共 ${targetWords} 个。`);
  } else if (typeof currentWords === 'number' && (currentWords < 1200 || isWeakScore(body))) {
    tips.push(`请考虑撰写更多文本。当前词语数约 ${currentWords}。`);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    tips.push('您的文章尚无标题。将其添加为第一段。');
  } else if (title.length > 60) {
    tips.push('您的标题超过 60 个字符。在搜索结果中显示时，标题能被截断。');
  }

  return tips;
}

function synthesizeSeoTips(
  body: SemrushRecommendationsPayload,
  recommended: string[],
  targetKeywords: string[],
): string[] {
  const tips: string[] = [];

  if (recommended.length > 0) {
    const preview = recommended.slice(0, 8).join(', ');
    const suffix = recommended.length > 8 ? ` 等 ${recommended.length} 个` : '';
    tips.push(`添加推荐关键词: ${preview}${suffix}`);
  }

  if (targetKeywords.length > 0) {
    tips.push(`目标关键词: ${targetKeywords.join(', ')}`);
  }

  if (recommended.length > 0 || isWeakScore(body)) {
    tips.push('在您的帖子中添加链接可以使其对读者更具权威性和实用性。');
    tips.push('使用图片丰富您的文字，增强对读者的吸引力。');
  }

  return tips;
}

function synthesizeToneTips(body: SemrushRecommendationsPayload): string[] {
  const tips: string[] = [];

  if (isWeakScore(body) || (typeof body.readability === 'number' && body.readability < 70)) {
    tips.push('重写非常随意的句子。');
    tips.push('考虑移除或替换填充词。');
  }

  if (typeof body.formality_level === 'string' && body.formality_level.trim()) {
    tips.push(`语气形式: ${body.formality_level.trim()}`);
  }

  return tips;
}

export interface ParsedSemrushRecommendations {
  details: SemrushSuggestionDetails;
  overall?: number;
  recommendedKeywords?: string[];
  targetKeywords?: string[];
  competitorWordCount?: number;
  currentWordCount?: number;
  readabilityScore?: number;
}

export function isSemrushRecommendationsPayload(body: unknown): body is SemrushRecommendationsPayload {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return (
    'data_ready' in record ||
    'recommended_keywords' in record ||
    'score' in record ||
    'gdoc_id' in record
  );
}

export function parseSemrushRecommendationsPayload(
  body: SemrushRecommendationsPayload,
): ParsedSemrushRecommendations {
  const details: SemrushSuggestionDetails = {};

  const recommended = (body.recommended_keywords ?? [])
    .map((item) => item.keyword?.trim())
    .filter((keyword): keyword is string => Boolean(keyword));

  const targetKeywords = (body.keywords ?? [])
    .map((item) => item.keyword?.trim())
    .filter((keyword): keyword is string => Boolean(keyword));

  if (body.data_ready === true) {
    const readability = synthesizeReadabilityTips(body);
    const seo = synthesizeSeoTips(body, recommended, targetKeywords);
    const tone = synthesizeToneTips(body);

    if (readability.length > 0) details.readability = readability;
    if (seo.length > 0) details.seo = seo;
    if (tone.length > 0) details.tone = tone;
  } else {
    if (recommended.length > 0) {
      const preview = recommended.slice(0, 8).join(', ');
      const suffix = recommended.length > 8 ? ` 等 ${recommended.length} 个` : '';
      details.seo = [`添加推荐关键词: ${preview}${suffix}`];
    }
    if (targetKeywords.length > 0) {
      details.seo = [
        ...(details.seo ?? []),
        `目标关键词: ${targetKeywords.join(', ')}`,
      ];
    }
  }

  const overall = parseOverallScore(body);
  const competitorWordCount =
    typeof body.length === 'number' && body.length > 0 ? body.length : undefined;
  const currentWordCount =
    typeof body.original_length === 'number' && body.original_length > 0
      ? body.original_length
      : competitorWordCount;
  const readabilityScore =
    typeof body.readability === 'number'
      ? body.readability
      : typeof body.original_readability === 'number'
        ? body.original_readability
        : undefined;

  return {
    details,
    overall,
    recommendedKeywords: recommended,
    targetKeywords,
    competitorWordCount,
    currentWordCount,
    readabilityScore,
  };
}

/** Semrush 偶发在侧栏未稳定时返回 score=1.0/10 或 10/10；即使 score_quality=极佳 也可能是占位满分 */
function isSuspiciousPerfectApiScore(body: SemrushRecommendationsPayload): boolean {
  if (typeof body.score !== 'number') return false;

  if (body.score > 0 && body.score <= 1 && body.score >= 0.99) return true;
  if (body.score > 9.5 && body.score <= 10) return true;
  if (body.score > 95 && body.score <= 100) return true;

  return false;
}

/** 从 recommendations API 解析 0–10 分制总分，避免把 1.0 误当成 10 分 */
export function parseOverallScore(body: SemrushRecommendationsPayload): number | undefined {
  if (body.data_ready !== true || typeof body.score !== 'number') {
    return undefined;
  }

  const score = body.score;
  const quality = typeof body.score_quality === 'string' ? body.score_quality.toLowerCase() : '';
  const weakQuality = /bad|medium|average|needs|一般|中等|糟糕|需改进/.test(quality);

  if (isSuspiciousPerfectApiScore(body)) {
    return undefined;
  }

  if (score > 0 && score <= 1) {
    const scaled = Math.round(score * 1000) / 100;
    if (score >= 0.99 && weakQuality) {
      return undefined;
    }
    return scaled;
  }

  if (score > 1 && score <= 10) {
    return score;
  }

  if (score > 10 && score <= 100) {
    return Math.round(score) / 10;
  }

  return undefined;
}

export function pickBestRecommendationsCapture(
  captured: Array<{ url: string; body: unknown }>,
): ParsedSemrushRecommendations | null {
  let lastReady: ParsedSemrushRecommendations | null = null;
  let fallback: ParsedSemrushRecommendations | null = null;

  for (const { url, body } of captured) {
    if (!isSemrushRecommendationsPayload(body)) continue;
    if (!/\/recommendations\//i.test(url)) continue;

    const parsed = parseSemrushRecommendationsPayload(body);
    const ready = body.data_ready === true;
    const hasDetails = Object.values(parsed.details).some(
      (items) => Array.isArray(items) && items.length > 0,
    );

    if (!ready && !hasDetails && parsed.overall === undefined) {
      continue;
    }

    fallback = parsed;
    if (ready) {
      lastReady = parsed;
    }
  }

  return lastReady ?? fallback;
}

function extractIssueTexts(value: unknown, depth = 0): string[] {
  if (!value || depth > 6) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 6 ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => extractIssueTexts(item, depth + 1)))];
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const direct =
      (typeof record.text === 'string' && record.text) ||
      (typeof record.message === 'string' && record.message) ||
      (typeof record.title === 'string' && record.title) ||
      (typeof record.description === 'string' && record.description) ||
      (typeof record.hint === 'string' && record.hint) ||
      '';
    if (direct.trim().length > 6) {
      return [direct.trim()];
    }

    const bucketKeys = ['issues', 'recommendations', 'items', 'messages', 'hints', 'checks'];
    for (const key of bucketKeys) {
      const items = extractIssueTexts(record[key], depth + 1);
      if (items.length > 0) return items;
    }

    return extractIssueTexts(Object.values(record), depth + 1);
  }

  return [];
}

/** last_status 接口在分析完成后可能携带分条建议 */
export function parseLastStatusPayload(body: unknown): SemrushSuggestionDetails {
  const details: SemrushSuggestionDetails = {};
  if (!body || typeof body !== 'object') return details;

  const record = body as Record<string, unknown>;
  const recommendation = record.recommendation;
  if (!recommendation || typeof recommendation !== 'object') return details;

  const sectionMap: Record<string, keyof SemrushSuggestionDetails> = {
    readability: 'readability',
    readable: 'readability',
    seo: 'seo',
    tone: 'tone',
    tonality: 'tone',
    originality: 'originality',
    plagiarism: 'originality',
  };

  for (const [sourceKey, target] of Object.entries(sectionMap)) {
    const section = (recommendation as Record<string, unknown>)[sourceKey];
    const items = extractIssueTexts(section);
    if (items.length > 0) {
      details[target] = [...new Set([...(details[target] ?? []), ...items])];
    }
  }

  const generic = extractIssueTexts(recommendation);
  if (generic.length > 0 && !Object.keys(details).length) {
    details.readability = generic;
  }

  return details;
}
