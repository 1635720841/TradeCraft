/**
 * 从文件夹页探测进入 SEO 写作助手的多种路径。
 */
import { config } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });
const OUT = join(apiRoot, '.semrush-session', 'probe');

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const username = process.env.SEMRUSH_3UE_USERNAME;
const password = process.env.SEMRUSH_3UE_PASSWORD;
const channel = process.env.SEMRUSH_BROWSER_CHANNEL || 'chrome';

async function openSemrush(context) {
  const dash = await context.newPage();
  await dash.goto('https://dash.3ue.com/zh-Hans/#/page/m/home', { waitUntil: 'networkidle', timeout: 90_000 });
  if (dash.url().includes('/login')) {
    await dash.locator('#input-username').fill(username);
    await dash.locator('#input-password').fill(password);
    await dash.locator('button[status="primary"]:has-text("登录")').click();
    await dash.locator('button:has-text("打开")').first().waitFor({ state: 'visible', timeout: 60_000 });
  }
  const card = dash.locator('nb-card').filter({ has: dash.locator('button:has-text("打开")') }).first();
  const nodeBtn = card.locator('nb-select button.select-button').first();
  const nodeText = ((await nodeBtn.textContent()) ?? '').trim();
  if (nodeText === '未选择节点' || nodeText.includes('❌')) {
    await nodeBtn.click();
    await dash.waitForTimeout(250);
    await nodeBtn.click();
    await dash.locator('.cdk-overlay-container nb-option').filter({ hasText: '✅' }).first().click();
  }
  const popupPromise = context.waitForEvent('page', { timeout: 20_000 });
  await dash.locator('button:has-text("打开")').first().click();
  const sem = await popupPromise;
  await sem.waitForURL((u) => !u.href.includes('gmitm.clean.cache'), { timeout: 60_000 });
  await sem.waitForTimeout(5000);
  await dash.close();
  return sem;
}

const browser = await chromium.launch({
  headless: true,
  channel: channel === 'chromium' ? undefined : channel,
  proxy: proxy ? { server: proxy } : undefined,
  args: ['--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  ignoreHTTPSErrors: true,
});

const sem = await openSemrush(context);
const report = { homeUrl: sem.url(), nav: [] };

// dump sidebar links
const sidebar = await sem.evaluate(() =>
  [...document.querySelectorAll('nav a, aside a, [class*="sidebar"] a, [class*="menu"] a')]
    .map((el) => ({
      text: el.textContent?.trim().slice(0, 60),
      href: el.getAttribute('href'),
    }))
    .filter((x) => x.text && x.text.length < 40),
);
report.sidebar = sidebar.slice(0, 40);

const navTargets = [
  'text=SEO 写作助手',
  'a[href*="/swa"]',
  'a:has-text("SEO 写作助手")',
  'a:has-text("内容")',
  'text=内容',
  '[aria-label*="SEO"]',
  'a[href*="writing"]',
];

for (const sel of navTargets) {
  const n = await sem.locator(sel).count();
  const vis = n > 0 ? await sem.locator(sel).first().isVisible().catch(() => false) : false;
  report.nav.push({ sel, count: n, visible: vis });
}

// Strategy: direct /swa/
const swaUrl = new URL(sem.url());
swaUrl.pathname = '/swa/';
await sem.goto(swaUrl.toString(), { waitUntil: 'commit', timeout: 60_000 });
report.poll = [];
for (let i = 0; i < 20; i += 1) {
  const count = await sem.locator('a:has-text("分析新文本")').count();
  report.poll.push({ i, count, title: (await sem.title()).slice(0, 60) });
  if (count > 0) break;
  await sem.waitForTimeout(2000);
}
report.afterGotoSwa = { url: sem.url(), title: await sem.title() };

const newLink = sem.locator('a:has-text("分析新文本")').first();
report.newAnalysisVisible = await newLink.isVisible().catch(() => false);
if (report.newAnalysisVisible) {
  await newLink.click();
  await sem.waitForURL(/\/swa\/checker\//, { timeout: 30_000 });
  report.checkerUrl = sem.url();
  report.checkerTitle = await sem.title();
  const kw = sem.locator('input[placeholder*="关键词"], input[placeholder*="keyword"]');
  report.keywordInputCount = await kw.count();
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'seo-nav-probe.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
