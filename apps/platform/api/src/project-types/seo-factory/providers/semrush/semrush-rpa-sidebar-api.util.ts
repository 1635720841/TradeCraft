import type { SemrushSuggestionDetails } from '@wm/provider-interfaces';
import type { Page } from 'playwright';
import { parseChecksPayload } from './semrush-checks.parser';
import {
  isSemrushRecommendationsPayload,
  parseLastStatusPayload,
  parseOverallScoreRelaxed,
  parseSemrushRecommendationsPayload,
  pickBestRecommendationsCapture,
  type ParsedSemrushRecommendations,
} from './semrush-recommendations.parser';
import { sleep } from './semrush-page-wait';
import type { CapturedApiPayload } from './semrush-rpa-score.util';
import {
  countSemrushSuggestions,
  hasAnySemrushSuggestions,
} from './semrush-rpa-suggestion-details.util';

export function buildSemrushLastStatusApiUrl(page: Page): string | null {
  const pageUrl = new URL(page.url());
  const apiUrl = new URL(pageUrl.origin);
  apiUrl.pathname = '/swa/api/recommendations/last_status/';
  pageUrl.searchParams.forEach((value, key) => {
    apiUrl.searchParams.set(key, value);
  });
  return apiUrl.toString();
}

export function buildSemrushRecommendationsApiUrl(page: Page): string | null {
  const pageUrl = new URL(page.url());
  const gdocMatch = pageUrl.pathname.match(/smr-[0-9a-f-]{36}/i);
  if (!gdocMatch) return null;

  const apiUrl = new URL(pageUrl.origin);
  apiUrl.pathname = `/swa/api/recommendations/gdoc_id/${gdocMatch[0]}/`;
  pageUrl.searchParams.forEach((value, key) => {
    apiUrl.searchParams.set(key, value);
  });
  return apiUrl.toString();
}

export async function fetchSemrushChecksSuggestions(
  page: Page,
  captured: CapturedApiPayload[],
  onParsed?: (ctx: { url: string; count: number }) => void,
): Promise<SemrushSuggestionDetails> {
  for (const { url, body } of captured) {
    if (!/\/checks/i.test(url)) continue;
    const parsed = parseChecksPayload(body);
    if (hasAnySemrushSuggestions(parsed)) return parsed;
  }

  if (pickBestRecommendationsCapture(captured)) {
    return {};
  }

  const gdocMatch = page.url().match(/smr-[0-9a-f-]+/i);
  if (!gdocMatch) return {};

  const pageUrl = new URL(page.url());
  const paths = [
    `/swa/api/checks/gdoc_id/${gdocMatch[0]}/`,
    `/swa/api/checks/?gdoc_id=${gdocMatch[0]}`,
    `/swa/api/recommendations/gdoc_id/${gdocMatch[0]}/checks/`,
  ];

  for (const path of paths) {
    const apiUrl = new URL(pageUrl.origin);
    apiUrl.pathname = path.split('?')[0];
    const qs = path.includes('?') ? path.split('?')[1] : '';
    if (qs) {
      for (const part of qs.split('&')) {
        const [key, value] = part.split('=');
        if (key && value) apiUrl.searchParams.set(key, value);
      }
    }
    pageUrl.searchParams.forEach((value, key) => apiUrl.searchParams.set(key, value));

    try {
      const body = await page.evaluate(async (url) => {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) return null;
        return response.json();
      }, apiUrl.toString());

      const parsed = parseChecksPayload(body);
      if (hasAnySemrushSuggestions(parsed)) {
        onParsed?.({ url: apiUrl.toString(), count: countSemrushSuggestions(parsed) });
        return parsed;
      }
    } catch {
      /* try next path */
    }
  }

  return {};
}

export async function fetchSemrushLastStatusSuggestions(
  page: Page,
): Promise<SemrushSuggestionDetails> {
  const apiUrl = buildSemrushLastStatusApiUrl(page);
  if (!apiUrl) return {};

  try {
    const body = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) return null;
      return response.json();
    }, apiUrl);

    return parseLastStatusPayload(body);
  } catch {
    return {};
  }
}

export async function fetchSemrushRecommendationsWhenReady(
  page: Page,
  timeoutMs: number,
): Promise<ParsedSemrushRecommendations | null> {
  const apiUrl = buildSemrushRecommendationsApiUrl(page);
  if (!apiUrl) return null;

  const deadline = Date.now() + timeoutMs;
  let lastParsed: ParsedSemrushRecommendations | null = null;

  while (Date.now() < deadline) {
    try {
      const body = await page.evaluate(async (url) => {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) return null;
        return response.json();
      }, apiUrl);

      if (isSemrushRecommendationsPayload(body)) {
        const parsed = parseSemrushRecommendationsPayload(body);
        lastParsed = parsed;
        if (body.data_ready === true && parsed.overall !== undefined) {
          return parsed;
        }
        const relaxed = parseOverallScoreRelaxed(body);
        if (relaxed !== undefined) {
          return { ...parsed, overall: relaxed };
        }
      }
    } catch {
      /* 网络抖动时继续轮询 */
    }
    await sleep(timeoutMs <= 3_000 ? 600 : 1_200);
  }

  return lastParsed;
}
