/**
 * Semrush RPA 各阶段耗时探测（关键词 → 评分 → 侧栏提取）。
 * 用法：cd apps/platform/api && pnpm run build && node scripts/semrush-timing-probe.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

process.env.SEMRUSH_ENABLED = 'true';
process.env.SEMRUSH_HEADLESS = process.env.SEMRUSH_HEADLESS ?? 'false';

const { SemrushSessionManager } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-session.manager.js'
);
const { SemrushBrowserPool } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-browser-pool.js'
);
const { markdownToSemrushHtml } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-content.js'
);
const { SEMRUSH_SWA_SELECTORS } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush.selectors.js'
);
const { pollUntil, sleep, waitForAnyLocator } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-page-wait.js'
);
const {
  SEMRUSH_EXPAND_POLL_MS,
  SEMRUSH_RPA_TIMEOUT_MS,
  SEMRUSH_SWA_EDITOR_TIMEOUT_MS,
  SEMRUSH_UI_SETTLE_MS,
} = await import('../dist/project-types/seo-factory/providers/semrush/semrush.constants.js');
const { pickBestRecommendationsCapture } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-recommendations.parser.js'
);

class ConsoleLogger {
  info(msg, meta) {
    console.log('[info]', msg, meta ? JSON.stringify(meta) : '');
  }
  error(msg, meta) {
    console.error('[error]', msg, meta ?? '');
  }
  warn(msg, meta) {
    console.warn('[warn]', msg, meta ?? '');
  }
}

const logger = new ConsoleLogger();
const timings = [];
const mark = (label) => {
  const t = Date.now();
  timings.push({ label, at: t });
  const prev = timings[timings.length - 2];
  const delta = prev ? t - prev.at : 0;
  console.log(`[timing] +${delta}ms  ${label}`);
  return t;
};

const sample = `## What is Artificial Intelligence?

Artificial intelligence (AI) is a branch of computer science focused on building systems that can perform tasks typically requiring human intelligence. These tasks include learning from data, recognizing patterns, making decisions, and understanding natural language.

### How AI Works

AI systems rely on machine learning models trained on large amounts of data. Neural networks and deep learning architectures process information through multiple layers.

### Applications

Businesses use artificial intelligence for automation, decision support, customer service, and content generation.`;

const keyword = 'what is artificial intelligence';
const htmlContent = markdownToSemrushHtml(sample);
const browserPool = new SemrushBrowserPool(logger);
const sessionManager = new SemrushSessionManager(logger, browserPool);

const totalStart = Date.now();
mark('start');

await sessionManager.withBrowser(async (context) => {
  mark('browser_context_ready');
  const session = await sessionManager.openSemrushEditor(context);
  const { page } = session;
  mark('semrush_editor_open');

  const captured = [];
  const handler = async (response) => {
    const url = response.url();
    if (!/\/swa\/api\//i.test(url)) return;
    const ct = response.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    try {
      captured.push({ url, body: await response.json() });
    } catch {
      /* ignore */
    }
  };
  page.on('response', handler);

  await sessionManager.navigateToSwaChecker(page);
  mark('swa_checker_ready');

  const editor = await waitForAnyLocator(
    page,
    (p) => p.locator(SEMRUSH_SWA_SELECTORS.editor),
    { timeoutMs: SEMRUSH_SWA_EDITOR_TIMEOUT_MS, label: 'editor' },
  );

  // keyword setup (simplified)
  const setGoals = page.locator(SEMRUSH_SWA_SELECTORS.setNewGoals).first();
  if (await setGoals.isVisible().catch(() => false)) {
    await setGoals.click().catch(() => undefined);
    await sleep(400);
  }
  const keywordInput = page.locator(SEMRUSH_SWA_SELECTORS.keywordInput).first();
  if (await keywordInput.isVisible().catch(() => false)) {
    await keywordInput.fill(keyword);
    await keywordInput.press('Enter').catch(() => undefined);
    await sleep(400);
    const apply = page.locator(SEMRUSH_SWA_SELECTORS.applyKeywordGoal).first();
    if (await apply.isVisible().catch(() => false)) {
      await apply.click().catch(() => undefined);
    }
  }
  mark('keyword_goal_set');

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(500);
  await editor.evaluate((el, html) => {
    el.innerHTML = html;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, htmlContent);
  await sleep(SEMRUSH_UI_SETTLE_MS);
  mark('content_pasted');

  // trigger analyze
  await sleep(1_500);
  const analyzeBtn = page.locator(SEMRUSH_SWA_SELECTORS.analyzeAction).first();
  await analyzeBtn.click({ timeout: 30_000 }).catch(() => undefined);
  mark('analyze_clicked');

  // wait for score (simplified stable poll)
  const scoreDeadline = Date.now() + SEMRUSH_RPA_TIMEOUT_MS;
  let score = null;
  while (Date.now() < scoreDeadline) {
    const reAnalyze = await page
      .locator(SEMRUSH_SWA_SELECTORS.reAnalyze)
      .first()
      .isVisible()
      .catch(() => false);
    const listItems = await page
      .locator(SEMRUSH_SWA_SELECTORS.suggestionListItem)
      .count()
      .catch(() => 0);
    const apiCap = pickBestRecommendationsCapture(captured);
    if (reAnalyze && listItems >= 2 && apiCap?.overall) {
      score = apiCap.overall;
      break;
    }
    await sleep(1_500);
  }
  mark(`score_ready score=${score ?? 'timeout'}`);

  // simulate sidebar expand (current RPA logic)
  const widget = page.locator(SEMRUSH_SWA_SELECTORS.checkerWidget).first();
  const expandStart = Date.now();

  const dimensionLabels = ['可读性', 'Readability', '语气', 'Tone'];
  for (const label of dimensionLabels) {
    const tab = widget
      .locator(`[role="tab"]:has-text("${label}"), button:has-text("${label}")`)
      .first();
    if (await tab.isVisible().catch(() => false)) {
      await tab.click({ timeout: 2_500 }).catch(() => undefined);
    }
    await sleep(SEMRUSH_EXPAND_POLL_MS);
    await pollUntil(
      async () => (await widget.locator('[role="listitem"]').count().catch(() => 0)) > 1,
      { timeoutMs: 6_000, intervalMs: SEMRUSH_EXPAND_POLL_MS, label: label },
    ).catch(() => undefined);
  }

  for (let round = 0; round < 10; round += 1) {
    const showMore = widget.getByText(/展示更多|Show more/i);
    const count = await showMore.count().catch(() => 0);
    if (count === 0) break;
    for (let i = 0; i < count; i += 1) {
      await showMore.nth(i).click({ timeout: 2_000 }).catch(() => undefined);
      await sleep(SEMRUSH_EXPAND_POLL_MS);
    }
  }
  await sleep(600);
  mark(`sidebar_expand_1 took=${Date.now() - expandStart}ms`);

  // second expand (duplicate in current code)
  const expand2Start = Date.now();
  for (const label of dimensionLabels) {
    const tab = widget
      .locator(`[role="tab"]:has-text("${label}"), button:has-text("${label}")`)
      .first();
    if (await tab.isVisible().catch(() => false)) {
      await tab.click({ timeout: 2_500 }).catch(() => undefined);
    }
    await sleep(SEMRUSH_EXPAND_POLL_MS);
    await pollUntil(
      async () => (await widget.locator('[role="listitem"]').count().catch(() => 0)) > 1,
      { timeoutMs: 6_000, intervalMs: SEMRUSH_EXPAND_POLL_MS, label: label },
    ).catch(() => undefined);
  }
  await sleep(600);
  mark(`sidebar_expand_2_duplicate took=${Date.now() - expand2Start}ms`);

  // API fetch simulation (3x in current code)
  const pageUrl = new URL(page.url());
  const gdocMatch = pageUrl.pathname.match(/smr-[0-9a-f-]{36}/i);
  if (gdocMatch) {
    const apiUrl = `${pageUrl.origin}/swa/api/recommendations/gdoc_id/${gdocMatch[0]}/`;
    for (let i = 1; i <= 3; i += 1) {
      const fetchStart = Date.now();
      await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'include' });
        return r.ok ? r.json() : null;
      }, apiUrl);
      mark(`api_fetch_${i} took=${Date.now() - fetchStart}ms`);
    }
  }

  const listItemCount = await page
    .locator(SEMRUSH_SWA_SELECTORS.suggestionListItem)
    .count()
    .catch(() => 0);
  const widgetText = await widget.innerText().catch(() => '');
  mark(`done listItems=${listItemCount} widgetChars=${widgetText.length}`);

  page.off('response', handler);
});

const totalMs = Date.now() - totalStart;
console.log('\n=== Timing Summary ===');
for (let i = 1; i < timings.length; i += 1) {
  console.log(`  ${timings[i].label}: ${timings[i].at - timings[i - 1].at}ms`);
}
console.log(`  TOTAL: ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);
