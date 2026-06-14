/**
 * 抓取 Semrush SWA 全部分析 API 响应（含 data_ready 之后）。
 */
import { config } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });
process.env.SEMRUSH_ENABLED = 'true';

const OUT = join(apiRoot, '.semrush-session', 'probe');

const { SemrushSessionManager } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-session.manager.js'
);
const { markdownToHtml } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-content.js'
);
const { SEMRUSH_SWA_SELECTORS } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush.selectors.js'
);

class ConsoleLogger {
  info(msg, meta) {
    console.log('[info]', msg, meta ?? '');
  }
  error() {}
  warn() {}
}

const logger = new ConsoleLogger();
const sessionManager = new SemrushSessionManager(logger);
const captured = [];

const sample = `## What is AI?

Artificial intelligence helps businesses automate decisions and improve efficiency with machine learning and data analytics.`;

await sessionManager.withBrowser(async (context) => {
  const session = await sessionManager.openSemrushEditor(context);
  const { page } = session;

  page.on('response', async (response) => {
    const url = response.url();
    if (!/sem\.3ue\.com.*\/swa\/api\//i.test(url)) return;
    const ct = response.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    try {
      const body = await response.json();
      captured.push({
        url,
        at: new Date().toISOString(),
        data_ready: body?.data_ready,
        score: body?.score,
        keys: body && typeof body === 'object' ? Object.keys(body) : [],
        body,
      });
    } catch {
      /* ignore */
    }
  });

  await sessionManager.navigateToSwaChecker(page);
  const editor = page.locator(SEMRUSH_SWA_SELECTORS.editor).first();
  await editor.waitFor({ state: 'visible', timeout: 90_000 });

  const setGoals = page.getByText('设置新目标', { exact: true });
  if (await setGoals.isVisible().catch(() => false)) {
    await setGoals.click();
    await page.waitForTimeout(2_000);
  }

  const keywordInput = page.locator(SEMRUSH_SWA_SELECTORS.keywordInput).first();
  if (await keywordInput.isVisible().catch(() => false)) {
    await keywordInput.fill('artificial intelligence');
    await page.keyboard.press('Enter').catch(() => undefined);
    await page.waitForTimeout(2_000);
  }

  await editor.evaluate((el, h) => {
    el.innerHTML = h;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, markdownToHtml(sample));

  const analyzeBtn = page.locator(SEMRUSH_SWA_SELECTORS.analyzeAction).first();
  await analyzeBtn.click({ timeout: 120_000 });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const ready = captured.some(
      (c) => c.data_ready === true || (typeof c.score === 'number' && c.score > 0),
    );
    const hasRecs = captured.some(
      (c) =>
        c.body?.recommendations?.length > 0 ||
        c.body?.issues?.length > 0 ||
        c.body?.readability_recommendations?.length > 0,
    );
    if (ready && hasRecs) break;
    if (ready && captured.length >= 3) break;
    await page.waitForTimeout(2_000);
  }

  await page.waitForTimeout(3_000);
  await page.close().catch(() => undefined);
});

await mkdir(OUT, { recursive: true });
const outPath = join(OUT, 'recommendations-api-dump.json');
await writeFile(outPath, JSON.stringify(captured, null, 2));
console.log(`Wrote ${captured.length} responses to ${outPath}`);
