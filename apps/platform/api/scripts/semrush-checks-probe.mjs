/**
 * 分析完成后探测 SWA checks/issues 类 API。
 */
import { config } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });
process.env.SEMRUSH_ENABLED = 'true';
process.env.SEMRUSH_HEADLESS = 'false';

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
const { pollUntil, sleep } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-page-wait.js'
);

class ConsoleLogger {
  info(m, x) {
    console.log('[info]', m, x ?? '');
  }
  error(m, x) {
    console.error('[error]', m, x ?? '');
  }
  warn() {}
}

const logger = new ConsoleLogger();
const sessionManager = new SemrushSessionManager(logger);

const sample = `## What is Artificial Intelligence?

Artificial intelligence helps businesses automate decisions with machine learning, neural networks, and natural language processing.`;

const paths = (gdocId) => [
  `/swa/api/checks/gdoc_id/${gdocId}/`,
  `/swa/api/checks/?gdoc_id=${gdocId}`,
  `/swa/api/recommendations/gdoc_id/${gdocId}/checks/`,
  `/swa/api/recommendations/gdoc_id/${gdocId}/issues/`,
  `/swa/api/issues/gdoc_id/${gdocId}/`,
  `/swa/api/recommendations/last_status/`,
];

await sessionManager.withBrowser(async (context) => {
  const session = await sessionManager.openSemrushEditor(context);
  const { page } = session;
  await sessionManager.navigateToSwaChecker(page);

  const editor = page.locator(SEMRUSH_SWA_SELECTORS.editor).first();
  await editor.waitFor({ state: 'visible', timeout: 90_000 });

  const setGoals = page.getByText('设置新目标', { exact: true });
  if (await setGoals.isVisible().catch(() => false)) {
    await setGoals.click();
    await sleep(2_000);
  }

  const keywordInput = page.locator(SEMRUSH_SWA_SELECTORS.keywordInput).first();
  await keywordInput.fill('what is artificial intelligence');
  await page.keyboard.press('Enter').catch(() => undefined);
  await sleep(2_000);

  await editor.evaluate((el, h) => {
    el.innerHTML = h;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, markdownToHtml(sample));

  await page.locator(SEMRUSH_SWA_SELECTORS.analyzeAction).first().click({ timeout: 120_000 });

  await pollUntil(
    async () => {
      const text = await page.locator('body').innerText().catch(() => '');
      return /可读性|Readability|过于复杂|too complex/i.test(text);
    },
    { timeoutMs: 120_000, label: 'sidebar markers' },
  ).catch(() => undefined);

  await sleep(5_000);

  const gdocMatch = page.url().match(/smr-[0-9a-f-]+/i);
  const gdocId = gdocMatch?.[0] ?? '';
  const pageUrl = new URL(page.url());
  const results = [];

  for (const path of paths(gdocId)) {
    const apiUrl = new URL(pageUrl.origin);
    apiUrl.pathname = path.split('?')[0];
    const qs = path.includes('?') ? path.split('?')[1] : '';
    if (qs) {
      for (const part of qs.split('&')) {
        const [k, v] = part.split('=');
        apiUrl.searchParams.set(k, v);
      }
    }
    pageUrl.searchParams.forEach((v, k) => apiUrl.searchParams.set(k, v));

    const body = await page
      .evaluate(async (url) => {
        const res = await fetch(url, { credentials: 'include' });
        const text = await res.text();
        try {
          return { status: res.status, json: JSON.parse(text) };
        } catch {
          return { status: res.status, text: text.slice(0, 500) };
        }
      }, apiUrl.toString())
      .catch((e) => ({ error: String(e) }));

    results.push({ url: apiUrl.toString(), body });
  }

  const dom = await page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
    const idx = text.indexOf('可读性');
    return {
      frameCount: window.frames.length,
      hasReadability: text.includes('可读性'),
      hasComplex: /过于复杂|too complex/i.test(text),
      readabilitySlice: idx >= 0 ? text.slice(idx, idx + 2000) : text.slice(0, 1500),
    };
  });

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'checks-probe.json'), JSON.stringify({ gdocId, dom, results }, null, 2));
  console.log('dom:', dom);
  console.log('api results:', results.map((r) => ({ url: r.url, status: r.body?.status, keys: r.body?.json && Object.keys(r.body.json) })));

  await page.close().catch(() => undefined);
});
