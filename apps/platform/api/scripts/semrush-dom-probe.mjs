/**
 * 探测 3ue / Semrush SWA 页面 DOM，输出选择器候选。
 */
import { config } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

const OUT_DIR = join(apiRoot, '.semrush-session', 'probe');
const username = process.env.SEMRUSH_3UE_USERNAME;
const password = process.env.SEMRUSH_3UE_PASSWORD;
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

async function dumpInputs(page, label) {
  return page.evaluate((lbl) => {
    const inputs = [...document.querySelectorAll('input, textarea, button, [contenteditable="true"]')].map(
      (el, i) => {
        const rect = el.getBoundingClientRect();
        return {
          index: i,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type'),
          id: el.id || null,
          name: el.getAttribute('name'),
          className: el.className?.toString?.().slice(0, 120) || null,
          placeholder: el.getAttribute('placeholder'),
          text: (el.textContent || '').trim().slice(0, 80),
          ariaLabel: el.getAttribute('aria-label'),
          visible: rect.width > 0 && rect.height > 0,
          outer: el.outerHTML.slice(0, 300),
        };
      },
    );
    return { label: lbl, url: location.href, inputs };
  }, label);
}

async function shot(page, name) {
  await mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({
    path: join(OUT_DIR, `${name}.png`),
    fullPage: false,
    timeout: 10_000,
  }).catch(() => undefined);
}

const browser = await chromium.launch({
  headless: process.env.SEMRUSH_HEADLESS !== 'false',
  proxy: proxy ? { server: proxy } : undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const report = { steps: [], errors: [] };

try {
  await page.goto('https://dash.3ue.com/zh-Hans/', { waitUntil: 'networkidle', timeout: 90_000 });
  await page.waitForTimeout(2000);
  report.steps.push(await dumpInputs(page, 'login-page'));
  await shot(page, '01-login');

  // try multiple selector strategies
  const strategies = [
    'input[placeholder="请输入用户名"]',
    'input[placeholder*="用户名"]',
    'label:has-text("用户名") + input',
    'label:has-text("用户名") ~ input',
    'form input[type="text"]',
    'input.el-input__inner',
    'input:not([type="password"])',
  ];

  let userSel = null;
  for (const sel of strategies) {
    const n = await page.locator(sel).count();
    if (n > 0) {
      userSel = sel;
      report.steps.push({ foundUserSelector: sel, count: n });
      break;
    }
  }

  const passStrategies = [
    'input[placeholder="密码"]',
    'input[placeholder*="密码"]',
    'input[type="password"]',
  ];
  let passSel = null;
  for (const sel of passStrategies) {
    const n = await page.locator(sel).count();
    if (n > 0) {
      passSel = sel;
      report.steps.push({ foundPassSelector: sel, count: n });
      break;
    }
  }

  if (!userSel || !passSel) {
    throw new Error(`未找到输入框 user=${userSel} pass=${passSel}`);
  }

  await page.locator(userSel).first().click();
  await page.locator(userSel).first().fill(username);
  await page.locator(passSel).first().click();
  await page.locator(passSel).first().fill(password);
  await shot(page, '02-filled');

  const loginBtnStrategies = [
    'button:has-text("登录")',
    'button.el-button:has-text("登录")',
    'button[type="submit"]',
    '.el-button--primary',
  ];
  let loginSel = null;
  for (const sel of loginBtnStrategies) {
    if ((await page.locator(sel).count()) > 0) {
      loginSel = sel;
      break;
    }
  }
  report.steps.push({ loginSelector: loginSel });
  await page.locator(loginSel).first().click();
  await page.waitForURL(/page\/m\/home/, { timeout: 90_000 });
  report.steps.push({ afterLoginUrl: page.url() });
  await shot(page, '03-home');

  report.steps.push(await dumpInputs(page, 'home-page'));

  const openSel = 'button:has-text("打开"), span:has-text("打开"), a:has-text("打开")';
  const popupPromise = context.waitForEvent('page', { timeout: 25_000 }).catch(() => null);
  await page.locator(openSel).first().click();
  const popup = await popupPromise;
  const semPage = popup ?? page;
  await semPage.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await semPage.waitForTimeout(3000);
  report.steps.push({ semrushUrl: semPage.url() });
  await shot(semPage, '04-semrush');

  const swaUrl = new URL(semPage.url());
  swaUrl.pathname = '/swa/';
  await semPage.goto(swaUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await semPage.waitForTimeout(3000);
  report.steps.push({ swaUrl: semPage.url() });
  report.steps.push(await dumpInputs(semPage, 'swa-list'));
  await shot(semPage, '05-swa');

  const newBtn = semPage.locator(
    'button:has-text("分析新文本"), a:has-text("分析新文本"), button:has-text("Analyze new text")',
  );
  if ((await newBtn.count()) > 0) {
    await newBtn.first().click();
    await semPage.waitForURL(/\/swa\/checker\//, { timeout: 60_000 }).catch(() => undefined);
    await semPage.waitForTimeout(3000);
    report.steps.push({ checkerUrl: semPage.url() });
    report.steps.push(await dumpInputs(semPage, 'swa-checker'));
    await shot(semPage, '06-checker');
  }

  report.success = true;
  report.recommended = { userSel, passSel, loginSel, openSel };
} catch (e) {
  report.errors.push(e instanceof Error ? e.message : String(e));
  await shot(page, 'error').catch(() => undefined);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));

await browser.close();
