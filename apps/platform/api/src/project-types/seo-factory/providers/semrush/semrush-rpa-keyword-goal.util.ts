import type { Page } from 'playwright';
import {
  SEMRUSH_EXPAND_POLL_MS,
  SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
} from './semrush.constants';
import { pollUntil, sleep } from './semrush-page-wait';
import {
  isSemrushKeywordStrictlyPresent,
} from './semrush-keyword-coverage.util';
import { filterSemrushSubmittedKeywordsInContent } from './semrush-submitted-keywords.util';
import { isSemrushSpecificKeyword, sanitizeSemrushKeywordGoal, flattenSemrushKeywordList } from './semrush-keywords.util';
import { SEMRUSH_SWA_SELECTORS } from './semrush.selectors';

export type SemrushKeywordGoalLogger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
};

export function collectSemrushKeywordList(
  primary: string,
  recommendedKeywords: string[] | undefined,
  logger: SemrushKeywordGoalLogger,
): string[] {
  const { keywords, dropped } = sanitizeSemrushKeywordGoal(primary, recommendedKeywords);
  if (dropped.length > 0) {
    logger.info('Semrush keywords filtered before submit', {
      action: 'semrush.keyword_filter',
      dropped,
      kept: keywords,
      keptCount: keywords.length,
    });
  }
  return keywords;
}

export async function setupSemrushKeywordGoal(
  page: Page,
keyword: string,
content: string,
logger: SemrushKeywordGoalLogger,
recommendedKeywords?: string[],
submittedKeywords?: string[],
): Promise<void> {
  const plannedRaw = flattenSemrushKeywordList(
    submittedKeywords && submittedKeywords.length > 0
      ? submittedKeywords
      : collectSemrushKeywordList(keyword, recommendedKeywords, logger),
  );
  const looselyPresent = filterSemrushSubmittedKeywordsInContent(content, plannedRaw);

  // 只把「正文里连续完整出现」的词填进 Semrush 关键词框：宽松匹配（跨填充词/
  // 词形变体）会把正文里其实没有的目标词放进去。严格过滤后若不足 2 个（Semrush
  // 设目标的最低要求），回退到宽松结果，避免无法设目标导致评分流程异常。
  const strictlyPresent = looselyPresent.filter((kw) =>
    isSemrushKeywordStrictlyPresent(content, kw),
  );
  const droppedLooseKeywords = looselyPresent.filter(
    (kw) => !strictlyPresent.includes(kw),
  );
  const plannedKeywords =
    strictlyPresent.length >= 2 ? strictlyPresent : looselyPresent;

  if (droppedLooseKeywords.length > 0 && strictlyPresent.length >= 2) {
    logger.info('Semrush keywords dropped: not strictly present in content', {
      action: 'semrush.keyword_loose_dropped',
      dropped: droppedLooseKeywords,
      kept: plannedKeywords,
      keptCount: plannedKeywords.length,
    });
  }

  if (plannedKeywords.length === 0) {
    logger.warn('Semrush keyword goal skipped: no content-aligned keywords', {
      action: 'semrush.keyword_goal_empty',
      primaryKeyword: keyword,
    });
    return;
  }

  if (await isSemrushKeywordGoalSatisfied(page, plannedKeywords)) {
    logger.info('Semrush keyword goal already active, skipping setup', {
      action: 'semrush.keyword_goal_skip',
      primaryKeyword: plannedKeywords[0] ?? keyword,
      keywordCount: plannedKeywords.length,
    });
    return;
  }

  const keywords = plannedKeywords;
  const keywordInput = await ensureSemrushKeywordInputVisible(page);

  await clearSemrushKeywordTags(page, keywordInput);
  await typeSemrushKeywordTags(keywordInput, keywords);
  await sleep(300);

  // 输完关键词标签立即去填正文：仅本地快速裁剪一次明显的泛词，
  // 不在此阶段长轮询校验、也不点「获取推荐」。关键词作为 goal 已存在，
  // 待正文填好后由 triggerAnalysisIfNeeded 统一点一次「获取推荐」触发分析，
  // 避免空正文的多余分析与两段 15s 等待。
  await pruneSemrushInvalidKeywordTags(page, keyword);

  logger.info('Semrush keyword goal set', {
    action: 'semrush.keyword_goal',
    keywords,
    keywordCount: keywords.length,
    primaryKeyword: keyword,
    recommendedCount: recommendedKeywords?.length ?? 0,
  });
}

/** Only skip goal setup when active SWA tags exactly match the stable target list. */
export async function isSemrushKeywordGoalSatisfied(
  page: Page,
  plannedKeywords: string[],
): Promise<boolean> {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const planned = plannedKeywords.map(normalize).filter(Boolean);
  if (planned.length === 0) return false;

  const active = (await getSemrushKeywordTagTexts(page)).map(normalize).filter(Boolean);
  if (active.length === 0 || active.length !== planned.length) return false;

  const activeSet = new Set(active);
  return planned.every((keyword) => activeSet.has(keyword));
}

export async function clearSemrushKeywordTags(
  page: Page,
  keywordInput: ReturnType<Page['locator']>,
): Promise<void> {
  await keywordInput.click().catch(() => undefined);
  await keywordInput.fill('').catch(() => undefined);

  await page
    .evaluate(`() => {
      const input = document.querySelector(
        'input[placeholder*="输入以逗号分隔"], input[placeholder*="关键词"], input[placeholder*="keyword"], input[placeholder*="逗号"], [class*="SInputTags"] input, textarea[placeholder*="关键词"], textarea[placeholder*="keyword"]',
      );
      if (!input) return;
      let parent = input.parentElement;
      for (let depth = 0; depth < 8 && parent; depth += 1) {
        const buttons = parent.querySelectorAll(
          'button[aria-label*="Remove"], button[aria-label*="删除"], button[class*="close" i], button[class*="remove" i]',
        );
        for (const btn of buttons) {
          btn.click();
        }
        parent = parent.parentElement;
      }
    }`)
    .catch(() => undefined);

  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Backspace').catch(() => undefined);
  }
  await sleep(400);
}

/** 逐个输入关键词并以逗号/回车生成标签，避免 SWA 把整串逗号文本合并成一个标签。 */
export async function typeSemrushKeywordTags(
  keywordInput: ReturnType<Page['locator']>,
  keywords: string[],
): Promise<void> {
  await keywordInput.click();
  await keywordInput.fill('');

  if (keywords.length === 0) return;

  for (const kw of keywords) {
    await keywordInput.pressSequentially(kw, { delay: 12 });
    await sleep(80);
    await keywordInput.press(',');
    await sleep(120);
  }

  await keywordInput.press('Enter').catch(() => undefined);
  await sleep(150);
}

export function semrushKeywordInputLocator(page: Page): ReturnType<Page['locator']> {
  return page.locator(SEMRUSH_SWA_SELECTORS.keywordInput).first();
}

export async function isSemrushKeywordInputVisible(page: Page): Promise<boolean> {
  return semrushKeywordInputLocator(page).isVisible().catch(() => false);
}

export async function ensureSemrushKeywordInputVisible(page: Page): Promise<ReturnType<Page['locator']>> {
  await page
    .locator(SEMRUSH_SWA_SELECTORS.checkerWidget)
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);

  await tryExpandSemrushNewGoals(page);
  if (await isSemrushKeywordInputVisible(page)) {
    return semrushKeywordInputLocator(page);
  }

  let lastExpandAt = Date.now();
  await pollUntil(
    async () => {
      if (await isSemrushKeywordInputVisible(page)) return true;
      // 节流展开点击，避免某些节点下重复点击把折叠区反复开/关。
      const now = Date.now();
      if (now - lastExpandAt >= 600) {
        lastExpandAt = now;
        await tryExpandSemrushNewGoals(page);
      }
      return isSemrushKeywordInputVisible(page);
    },
    {
      timeoutMs: SEMRUSH_SWA_SIDEBAR_TIMEOUT_MS,
      intervalMs: SEMRUSH_EXPAND_POLL_MS,
      label: '关键词输入框（需展开「设置新目标」）',
    },
  );

  return semrushKeywordInputLocator(page);
}

/** 右侧「内容推荐」里关键词在折叠区；点击标题即可同步展开，无需长 settle */
export async function tryExpandSemrushNewGoals(page: Page): Promise<void> {
  if (await isSemrushKeywordInputVisible(page)) return;

  const setGoals = page.getByText('设置新目标', { exact: true });
  if (await setGoals.isVisible().catch(() => false)) {
    await clickSemrushGoalToggleIfCollapsed(setGoals);
    return;
  }

  const setGoalsEn = page.getByText('Set new goal', { exact: true });
  if (await setGoalsEn.isVisible().catch(() => false)) {
    await clickSemrushGoalToggleIfCollapsed(setGoalsEn);
    return;
  }

  const expanded = await page
    .evaluate(`() => {
      const labelRe = /设置新目标|Set new goal/i;
      const isGoalLabel = (raw) => {
        const text = (raw || '').replace(/\\s+/g, ' ').trim();
        if (!labelRe.test(text)) return false;
        return text.length <= 48;
      };

      const candidates = [];
      for (const el of document.querySelectorAll(
        'button, [role="button"], summary, [tabindex="0"], span, div, h3, h4',
      )) {
        const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!isGoalLabel(text)) continue;
        candidates.push({ el, len: text.length });
      }
      candidates.sort((a, b) => a.len - b.len);
      const hit = candidates[0]?.el;
      if (!hit) return false;

      const toggle =
        hit.closest('[aria-expanded]') ??
        hit.closest('button, [role="button"], summary') ??
        hit;
      if (toggle.getAttribute('aria-expanded') === 'true') return true;

      toggle.scrollIntoView({ block: 'center' });
      toggle.click();
      return true;
    }`)
    .catch(() => false);

  if (expanded) return;

  const expanders = [
    page.getByRole('button', { name: /设置新目标|Set new goal/i }),
    page.locator(SEMRUSH_SWA_SELECTORS.setNewGoals).first(),
    page.getByText(/设置新目标/),
    page.getByText(/Set new goal/i),
  ];

  for (const expander of expanders) {
    if (!(await expander.isVisible().catch(() => false))) continue;
    await clickSemrushGoalToggleIfCollapsed(expander);
    return;
  }
}

export async function clickSemrushGoalToggleIfCollapsed(
  locator: ReturnType<Page['locator']>,
): Promise<void> {
  const expanded = await locator
    .evaluate((el) => {
      const toggle =
        el.closest('[aria-expanded]') ??
        el.closest('button, [role="button"], summary') ??
        el;
      return toggle.getAttribute('aria-expanded') === 'true';
    })
    .catch(() => false);

  if (expanded) return;

  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.click({ timeout: 5_000 }).catch(() => undefined);
}

export function semrushPrimaryKeywordKeys(primary: string): Set<string> {
  return new Set(
    primary
      .split(/[,，]/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getSemrushKeywordTagTexts(page: Page): Promise<string[]> {
  const texts = await page
    .evaluate(`() => {
      const root = document.querySelector('[class*="SInputTags"]');
      if (!root) return [];
      const result = [];
      for (const btn of root.querySelectorAll(
        'button[aria-label*="Remove"], button[aria-label*="删除"], button[aria-label*="remove" i]',
      )) {
        const tag = btn.closest('[class*="Tag"]') ?? btn.parentElement;
        const text = (tag?.textContent || '')
          .replace(/[×x✕]/gi, '')
          .replace(/\\s+/g, ' ')
          .trim();
        if (text) result.push(text);
      }
      return result;
    }`)
    .catch(() => [] as string[]);
  return Array.isArray(texts) ? texts : [];
}

export async function removeSemrushKeywordTag(page: Page, tagText: string): Promise<void> {
  await page
    .evaluate(`(target) => {
      const root = document.querySelector('[class*="SInputTags"]');
      if (!root) return;
      for (const btn of root.querySelectorAll(
        'button[aria-label*="Remove"], button[aria-label*="删除"], button[aria-label*="remove" i]',
      )) {
        const tag = btn.closest('[class*="Tag"]') ?? btn.parentElement;
        const text = (tag?.textContent || '')
          .replace(/[×x✕]/gi, '')
          .replace(/\\s+/g, ' ')
          .trim();
        if (text?.toLowerCase() === target.toLowerCase()) {
          btn.click();
          return;
        }
      }
    }`, tagText)
    .catch(() => undefined);
  await sleep(350);
}

/** 移除 SWA 标灰的泛词标签，直至通过「输入具体的关键词」 */
export async function pruneSemrushInvalidKeywordTags(page: Page, primary: string): Promise<void> {
  const primaryKeys = semrushPrimaryKeywordKeys(primary);
  const tagTexts = await getSemrushKeywordTagTexts(page);

  for (const tag of tagTexts) {
    const isPrimary = primaryKeys.has(tag.toLowerCase());
    if (!isSemrushSpecificKeyword(tag, isPrimary)) {
      await removeSemrushKeywordTag(page, tag);
    }
  }
}
