/**
 * 探测 sem.3ue.com 打开后 cache-clean 跳转时序。
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const username = process.env.SEMRUSH_3UE_USERNAME;
const password = process.env.SEMRUSH_3UE_PASSWORD;

const browser = await chromium.launch({
  headless: true,
  proxy: proxy ? { server: proxy } : undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dash = await context.newPage();

await dash.goto('https://dash.3ue.com/zh-Hans/#/page/m/home', { waitUntil: 'networkidle', timeout: 90_000 });
if (dash.url().includes('/login')) {
  await dash.locator('#input-username').fill(username);
  await dash.locator('#input-password').fill(password);
  await dash.locator('button[status="primary"]:has-text("登录")').click();
  await dash.locator('button:has-text("打开")').first().waitFor({ state: 'visible', timeout: 60_000 });
}

const popupPromise = context.waitForEvent('page', { timeout: 25_000 });
await dash.locator('button:has-text("打开")').first().click();
const sem = await popupPromise;

const timeline = [];
const log = (label) => {
  timeline.push({ t: Date.now() - t0, label, url: sem.url() });
  console.log(`+${timeline.at(-1).t}ms [${label}] ${sem.url()}`);
};
const t0 = Date.now();

sem.on('framenavigated', (frame) => {
  if (frame === sem.mainFrame()) log('navigated');
});

log('popup-opened');

try {
  await sem.waitForURL((url) => !url.href.includes('gmitm.clean.cache'), { timeout: 90_000 });
  log('left-cache-clean');
} catch {
  log('still-on-cache-clean-after-90s');
}

await sem.waitForTimeout(3000);
log('after-3s');

const body = await sem.evaluate(() => ({
  title: document.title,
  text: document.body?.innerText?.slice(0, 200) ?? '',
  htmlLen: document.body?.innerHTML?.length ?? 0,
}));
console.log('body:', body);

await browser.close();
console.log('timeline:', JSON.stringify(timeline, null, 2));
