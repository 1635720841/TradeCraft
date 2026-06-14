/**
 * 从 Semrush 主站导航到 SWA 并探测 DOM。
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
const dash = await context.newPage();

await dash.goto('https://dash.3ue.com/zh-Hans/#/page/m/home', { waitUntil: 'networkidle', timeout: 90_000 });
if (dash.url().includes('/login')) {
  await dash.locator('#input-username').fill(username);
  await dash.locator('#input-password').fill(password);
  await dash.locator('button[status="primary"]:has-text("登录")').click();
  await dash.locator('button:has-text("打开")').first().waitFor({ state: 'visible', timeout: 60_000 });
}

// select first online node if needed
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

const report = { steps: [] };
report.steps.push({ label: 'sem-home', url: sem.url() });

async function dump(label) {
  const data = await sem.evaluate(() => {
    const links = [...document.querySelectorAll('a, button, [role="button"], [role="link"]')]
      .filter((el) => {
        const t = el.textContent?.trim() || '';
        return t.length > 0 && t.length < 80;
      })
      .slice(0, 40)
      .map((el) => ({
        tag: el.tagName,
        text: el.textContent?.trim().slice(0, 80),
        href: el.getAttribute('href'),
        aria: el.getAttribute('aria-label'),
      }));
    const inputs = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')].slice(0, 15).map((el) => ({
      tag: el.tagName,
      placeholder: el.getAttribute('placeholder'),
      ce: el.getAttribute('contenteditable'),
    }));
    return {
      url: location.href,
      title: document.title,
      bodyLen: document.body?.innerHTML?.length ?? 0,
      links,
      inputs,
    };
  });
  report.steps.push({ label, ...data });
  console.log(`[${label}]`, data.url, 'links:', data.links?.length);
  return data;
}

await dump('before-swa');

// Strategy 1: direct goto /swa/
const swaUrl = new URL(sem.url());
swaUrl.pathname = '/swa/';
await sem.goto(swaUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
await sem.waitForTimeout(5000);
await dump('after-goto-swa');

const strategies = [
  'text=SEO 写作助手',
  'text=SEO Writing Assistant',
  'a:has-text("分析新文本")',
  'button:has-text("分析新文本")',
  'text=分析新文本',
  'text=Analyze new text',
  'a[href*="/swa/"]',
];

for (const sel of strategies) {
  const n = await sem.locator(sel).count();
  if (n > 0) report.steps.push({ selector: sel, count: n, visible: await sem.locator(sel).first().isVisible().catch(() => false) });
}

// try click 分析新文本
for (const sel of ['button:has-text("分析新文本")', 'a:has-text("分析新文本")', 'text=分析新文本']) {
  const btn = sem.locator(sel).first();
  if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
    await btn.click();
    await sem.waitForTimeout(5000);
    await dump(`after-click-${sel}`);
    break;
  }
}

// try direct checker URL
const checkerUrl = new URL(sem.url());
checkerUrl.pathname = '/swa/checker/';
await sem.goto(checkerUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => {
  report.checkerGotoError = e.message;
});
await sem.waitForTimeout(5000);
await dump('after-goto-checker');

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'swa-nav-probe.json'), JSON.stringify(report, null, 2));
console.log('written swa-nav-probe.json');
await browser.close();
