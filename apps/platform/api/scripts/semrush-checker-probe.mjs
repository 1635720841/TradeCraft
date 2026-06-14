import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const channel = process.env.SEMRUSH_BROWSER_CHANNEL || 'chrome';

const browser = await chromium.launch({
  headless: true,
  channel: channel === 'chromium' ? undefined : channel,
  proxy: proxy ? { server: proxy } : undefined,
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN' });
const dash = await ctx.newPage();
await dash.goto('https://dash.3ue.com/zh-Hans/#/page/m/home', { waitUntil: 'networkidle', timeout: 90000 });
if (dash.url().includes('/login')) {
  await dash.locator('#input-username').fill(process.env.SEMRUSH_3UE_USERNAME);
  await dash.locator('#input-password').fill(process.env.SEMRUSH_3UE_PASSWORD);
  await dash.locator('button[status="primary"]:has-text("登录")').click();
  await dash.locator('button:has-text("打开")').first().waitFor({ state: 'visible', timeout: 60000 });
}
const popupP = ctx.waitForEvent('page', { timeout: 20000 });
await dash.locator('button:has-text("打开")').first().click();
const sem = await popupP;
await sem.waitForURL((u) => !u.href.includes('gmitm.clean.cache'), { timeout: 60000 });
await sem.waitForTimeout(5000);

const base = new URL(sem.url());
base.pathname = '/swa/checker/';
console.log('goto', base.toString());
await sem.goto(base.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await sem.waitForTimeout(5000);
console.log('url', sem.url(), 'title', await sem.title());

const dump = await sem.evaluate(() => ({
  buttons: [...document.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 30),
  inputs: [...document.querySelectorAll('input, textarea, [contenteditable="true"]')].map((el) => ({
    tag: el.tagName,
    ph: el.getAttribute('placeholder'),
    ce: el.getAttribute('contenteditable'),
  })),
}));
console.log(JSON.stringify(dump, null, 2));
await browser.close();
