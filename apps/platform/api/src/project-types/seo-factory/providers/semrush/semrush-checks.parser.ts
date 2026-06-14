import type { SemrushSuggestionDetails } from '@wm/provider-interfaces';

const SECTION_KEYS: Record<string, keyof SemrushSuggestionDetails> = {
  readability: 'readability',
  readable: 'readability',
  seo: 'seo',
  tone: 'tone',
  tonality: 'tone',
  originality: 'originality',
  plagiarism: 'originality',
};

function pickText(record: Record<string, unknown>): string | null {
  for (const key of ['text', 'message', 'title', 'description', 'hint', 'label', 'name']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 6) {
      return value.trim();
    }
  }
  return null;
}

function walkIssues(value: unknown, depth = 0): string[] {
  if (!value || depth > 8) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 6 ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => walkIssues(item, depth + 1)))];
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const direct = pickText(record);
    if (direct) return [direct];

    for (const key of ['issues', 'checks', 'items', 'messages', 'hints', 'recommendations']) {
      const nested = walkIssues(record[key], depth + 1);
      if (nested.length > 0) return nested;
    }

    const typeKey = typeof record.type === 'string' ? record.type.toLowerCase() : '';
    const section = SECTION_KEYS[typeKey];
    const nested = walkIssues(
      record.issue ?? record.check ?? record.data ?? record.payload,
      depth + 1,
    );
    if (section && nested.length > 0) {
      return nested;
    }

    return walkIssues(Object.values(record), depth + 1);
  }

  return [];
}

export function parseChecksPayload(body: unknown): SemrushSuggestionDetails {
  const details: SemrushSuggestionDetails = {};
  if (!body || typeof body !== 'object') return details;

  const record = body as Record<string, unknown>;

  for (const [sourceKey, target] of Object.entries(SECTION_KEYS)) {
    const section = record[sourceKey];
    const items = walkIssues(section);
    if (items.length > 0) {
      details[target] = [...new Set([...(details[target] ?? []), ...items])];
    }
  }

  const buckets = ['checks', 'issues', 'recommendations', 'results', 'data'];
  for (const key of buckets) {
    const items = walkIssues(record[key]);
    if (items.length > 0 && !Object.keys(details).length) {
      details.readability = items;
    }
  }

  const flat = walkIssues(body);
  if (flat.length > 0 && !Object.keys(details).length) {
    details.readability = flat.slice(0, 20);
  }

  return details;
}
