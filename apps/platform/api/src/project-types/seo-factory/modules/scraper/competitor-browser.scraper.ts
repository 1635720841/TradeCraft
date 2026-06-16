/**
 * Playwright 竞品页抓取回退（HTTP 失败或 JS 渲染页）。
 */

import { chromium } from 'playwright';
import { parseCompetitorPageHtml } from '@wm/shared-core';
import { getSemrushBrowserLaunchOptions } from '../../providers/semrush/semrush-browser.util';

export interface BrowserScrapeOptions {
  timeoutMs: number;
  maxChars: number;
  maxHeadings: number;
}

export function isCompetitorBrowserFallbackEnabled(): boolean {
  return process.env.SCRAPER_COMPETITOR_BROWSER_ENABLED === 'true';
}

export async function scrapeCompetitorPageWithBrowser(
  url: string,
  options: BrowserScrapeOptions,
): Promise<ReturnType<typeof parseCompetitorPageHtml> & { error?: string }> {
  let browser;

  try {
    browser = await chromium.launch(getSemrushBrowserLaunchOptions());
    const page = await browser.newPage({
      userAgent:
        process.env.SCRAPER_COMPETITOR_USER_AGENT?.trim() ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    });
    await page.waitForTimeout(1200);

    const html = await page.content();
    return parseCompetitorPageHtml(html, {
      maxChars: options.maxChars,
      maxHeadings: options.maxHeadings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '浏览器抓取失败';
    return {
      wordCount: 0,
      headings: [],
      excerpt: '',
      error: message,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
