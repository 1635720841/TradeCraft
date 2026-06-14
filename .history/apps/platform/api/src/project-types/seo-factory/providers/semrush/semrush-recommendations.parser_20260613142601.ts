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
      tips.push('Your text seems too complex. Consider simplifying it.');
    }
    tips.push('Split long paragraphs.');
    tips.push('Rewrite hard-to-read sentences.');
    tips.push('Consider using active voice.');
    if (readability < 65) {
      tips.push('Replace overly complex words.');
    }
  }

  const targetWords = body.length;
  const currentWords = body.original_length ?? body.length;
  if (
    typeof targetWords === 'number' &&
    typeof currentWords === 'number' &&
    currentWords > targetWords + 50
  ) {
    tips.push('Your text is longer than top-performing competitors. Consider shortening it.');
  } else if (
    typeof targetWords === 'number' &&
    typeof currentWords === 'number' &&
    targetWords > currentWords + 100
  ) {
    tips.push(`Consider writing more text. Current word count is ${currentWords} of ${targetWords}.`);
  } else if (typeof currentWords === 'number' && (currentWords < 1200 || isWeakScore(body))) {
    tips.push(`Consider writing more text. Current word count is about ${currentWords}.`);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    tips.push('Your article has no title. Add it as the first heading.');
  } else if (title.length > 60) {
    tips.push('Your title exceeds 60 characters. It may be truncated in search results.');
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
    const suffix = recommended.length > 8 ? ` and ${recommended.length - 8} more` : '';
    tips.push(`Add recommended keywords: ${preview}${suffix}`);
  }

  if (targetKeywords.length > 0) {
    tips.push(`Target keywords: ${targetKeywords.join(', ')}`);
  }

  if (recommended.length > 0 || isWeakScore(body)) {
    tips.push('Add links to make your post more authoritative and useful for readers.');
    tips.push('Use images to enrich your text and engage readers.');
  }

  return tips;
}

function synthesizeToneTips(body: SemrushRecommendationsPayload): string[] {
  const tips: string[] = [];

  if (isWeakScore(body) || (typeof body.readability === 'number' && body.readability < 70)) {
    tips.push('Rewrite overly casual sentences.');
    tips.push('Consider removing or replacing filler words.');
  }

  if (typeof body.formality_level === 'string' && body.formality_level.trim()) {
    tips.push(`Formality level: ${body.formality_level.trim()}`);
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
      const suffix = recommended.length > 8 ? ` and ${recommended.length - 8} more` : '';
      details.seo = [`Add recommended keywords: ${preview}${suffix}`];
    }
    if (targetKeywords.length > 0) {
      details.seo = [
        ...(details.seo ?? []),
        `Target keywords: ${targetKeywords.join(', ')}`,
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

/** Semrush 偶发在侧栏未稳定时返回 score=1.0 / 10，需结合 score_quality 再采信 */
function isSuspiciousPerfectApiScore(body: SemrushRecommendationsPayload): boolean {
  if (typeof body.score !== 'number') return false;

  const quality = typeof body.score_quality === 'string' ? body.score_quality.toLowerCase() : '';
  const strongQuality = /excellent|great|perfect|good|极佳|优秀|良好/.test(quality);
  if (strongQuality) return false;

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
