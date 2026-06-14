/**
 * 验证 domcontentloaded 时 URL 误判问题。
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

const HOME = 'https://dash.3ue.com/zh-Hans/#/page/m/home';
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

const browser = await chromium.launch({
  headless: true,
  proxy: proxy ? { server: proxy } : undefined,
});
const page = await browser.newPage();

const checks = [];

async function check(label) {
  const s = await page.evaluate(() => ({
    url: location.href,
    hasLogin: !!document.querySelector('#input-username'),
    openBtns: [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '打开').length,
  }));
  checks.push({ label, ...s });
  console.log(`[${label}]`, s);
}

await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await check('domcontentloaded');
console.log('page.url() includes home?', page.url().includes('/page/m/home'));

await page.waitForTimeout(2000);
await check('after 2s');

await page.waitForLoadState('networkidle').catch(() => {});
await check('networkidle');

await browser.close();
