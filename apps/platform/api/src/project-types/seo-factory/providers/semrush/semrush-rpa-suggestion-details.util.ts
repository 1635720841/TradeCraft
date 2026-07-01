import type { SemrushSuggestionDetails } from '@wm/provider-interfaces';

export const SEMRUSH_SECTION_LABELS: Record<keyof SemrushSuggestionDetails, string> = {
  readability: '可读性',
  seo: 'SEO',
  tone: '语气',
  originality: '原创性',
};

const SUGGESTION_KEYS = ['readability', 'seo', 'tone', 'originality'] as const;

export function normalizeSemrushSuggestionDetails(
  details?: SemrushSuggestionDetails | null,
): SemrushSuggestionDetails {
  if (!details || typeof details !== 'object') {
    return {};
  }
  return details;
}

export function hasAnySemrushSuggestions(
  details?: SemrushSuggestionDetails | null,
): boolean {
  if (!details || typeof details !== 'object') return false;
  return Object.values(details).some(
    (items) => Array.isArray(items) && items.length > 0,
  );
}

export function mergeSemrushSuggestionDetails(
  primary?: SemrushSuggestionDetails | null,
  secondary?: SemrushSuggestionDetails | null,
): SemrushSuggestionDetails {
  const safePrimary = normalizeSemrushSuggestionDetails(primary);
  const safeSecondary = normalizeSemrushSuggestionDetails(secondary);
  const merged: SemrushSuggestionDetails = {};

  for (const key of SUGGESTION_KEYS) {
    const combined = [...(safePrimary[key] ?? []), ...(safeSecondary[key] ?? [])];
    const unique = [...new Set(combined.map((s) => s.trim()).filter(Boolean))];
    if (unique.length > 0) {
      merged[key] = unique;
    }
  }

  return merged;
}

export function flattenSemrushSuggestions(
  details?: SemrushSuggestionDetails | null,
): string[] {
  const safeDetails = normalizeSemrushSuggestionDetails(details);
  const flat: string[] = [];

  for (const key of SUGGESTION_KEYS) {
    for (const item of safeDetails[key] ?? []) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      flat.push(`[${SEMRUSH_SECTION_LABELS[key]}] ${trimmed}`);
    }
  }

  return flat;
}

export function countSemrushSuggestions(
  details?: SemrushSuggestionDetails | null,
): number {
  if (!details) return 0;
  return SUGGESTION_KEYS.reduce(
    (sum, key) => sum + (details[key]?.length ?? 0),
    0,
  );
}
