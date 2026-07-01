/**
 * Semrush RPA 评分读取与合并（从 semrush-rpa.adapter 抽出）。
 */

import type { Page } from 'playwright';
import {
  pickBestRecommendationsCapture,
  parseOverallScoreRelaxed,
  isSemrushRecommendationsPayload,
} from './semrush-recommendations.parser';
import { parseOverallScoreFromText } from './semrush-score.util';

export interface CapturedApiPayload {
  url: string;
  body: unknown;
}

/** 接受 0.1–10 的有效分数（避免把词数等误判进来） */
export function resolveSemrushScore(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  if (raw > 0 && raw <= 10) return raw;
  return null;
}

/** 侧栏 DOM 为权威来源；API 偶发返回占位满分 10 */
export function pickSemrushOverallScore(
  domScore: number | null,
  apiScore: number | null,
  context: string,
  onMismatch?: (payload: { context: string; domScore: number; apiScore: number }) => void,
): number | null {
  if (domScore !== null) {
    if (apiScore !== null && Math.abs(domScore - apiScore) >= 0.5) {
      onMismatch?.({ context, domScore, apiScore });
    }
    return domScore;
  }
  return apiScore;
}

export function tryReadSemrushScoreFromApi(captured: CapturedApiPayload[]): number | null {
  return pickBestRecommendationsCapture(captured)?.overall ?? null;
}

/** data_ready 未置 true 时仍尝试从 recommendations 响应读分 */
export function tryReadSemrushScoreFromCaptured(captured: CapturedApiPayload[]): number | null {
  for (let i = captured.length - 1; i >= 0; i -= 1) {
    const body = captured[i]?.body;
    if (!isSemrushRecommendationsPayload(body)) continue;
    const relaxed = parseOverallScoreRelaxed(body);
    if (relaxed !== undefined) return relaxed;
  }
  return null;
}

export async function tryReadSemrushScoreFromDom(page: Page): Promise<number | null> {
  const widgetSnippet = await page
    .evaluate(`() => {
        const widget = document.querySelector('[data-test="swa-spa-checker-widget"]');
        if (!widget) return null;

        for (const el of widget.querySelectorAll('*')) {
          const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          if (text.length < 4 || text.length > 80) continue;
          if (/极佳|优秀|良好|Overall|\\/\\s*10|文章质量/i.test(text)) {
            return text;
          }
        }

        for (const el of widget.querySelectorAll('[aria-label]')) {
          const label = (el.getAttribute('aria-label') || '').trim();
          if (/极佳|Overall|\\/\\s*10|score/i.test(label)) {
            return label;
          }
        }

        return (widget.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400);
      }`)
    .catch(() => null);

  if (typeof widgetSnippet === 'string' && widgetSnippet.length > 0) {
    const fromWidget = parseOverallScoreFromText(widgetSnippet);
    if (fromWidget !== null) return fromWidget;
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  return parseOverallScoreFromText(bodyText);
}
