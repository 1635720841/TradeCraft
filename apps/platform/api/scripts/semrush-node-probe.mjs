/**
 * 打开节点列表并枚举选项。
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

const browser = await chromium.launch({ headless: true, proxy: proxy ? { server: proxy } : undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('https://dash.3ue.com/zh-Hans/#/page/m/home', { waitUntil: 'networkidle', timeout: 90_000 });
if (page.url().includes('/login')) {
  await page.locator('#input-username').fill(username);
  await page.locator('#input-password').fill(password);
  await page.locator('button[status="primary"]:has-text("登录")').click();
  await page.locator('button:has-text("打开")').first().waitFor({ state: 'visible', timeout: 60_000 });
}

const card = page.locator('nb-card').filter({ has: page.locator('button:has-text("打开")') }).first();
const nodeSelect = card.locator('nb-select').first().locator('button.select-button');

async function dumpOptions(label) {
  const opts = await page.evaluate(() =>
    [...document.querySelectorAll('.cdk-overlay-container nb-option, nb-option-list nb-option')].map((el) =>
      el.textContent?.trim().slice(0, 120),
    ),
  );
  console.log(label, opts);
  return opts;
}

await nodeSelect.click();
await page.waitForTimeout(300);
await dumpOptions('click1');

await nodeSelect.click();
await page.waitForTimeout(500);
await dumpOptions('click2');

await nodeSelect.focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(500);
await dumpOptions('arrow');

await nodeSelect.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await dumpOptions('enter');

await browser.close();
