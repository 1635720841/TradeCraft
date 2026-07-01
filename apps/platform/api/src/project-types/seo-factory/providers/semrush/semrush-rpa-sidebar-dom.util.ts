import type {
  SemrushActionableIssue,
  SemrushSuggestionDetails,
} from '@wm/provider-interfaces';
import type { Frame, Page } from 'playwright';
import {
  SEMRUSH_EXPAND_POLL_MS,
  SEMRUSH_SIDEBAR_TAB_POLL_MS,
} from './semrush.constants';
import { pollUntil, sleep } from './semrush-page-wait';
import {
  dedupeActionableIssues,
  parseActionableIssuesFromSidebarText,
} from './semrush-actionable.util';
import { SEMRUSH_SWA_SELECTORS } from './semrush.selectors';
import {
  hasAnySemrushSuggestions,
  mergeSemrushSuggestionDetails,
  normalizeSemrushSuggestionDetails,
} from './semrush-rpa-suggestion-details.util';

export async function countSemrushSidebarSuggestions(page: Page): Promise<number> {
  return page.locator(SEMRUSH_SWA_SELECTORS.suggestionListItem).count().catch(() => 0);
}

  export async function dumpSemrushSidebarDebug(
  page: Page,
  ctx: { apiDetails: SemrushSuggestionDetails; domDetails: SemrushSuggestionDetails },
  logger: { info: (msg: string, meta?: Record<string, unknown>) => void },
): Promise<void> {
    const dump = (await page.evaluate(`() => {
      const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ');
      const vw = window.innerWidth;
      const rightSide = [...document.querySelectorAll('li, p, span, div, button')]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.x > vw * 0.42 && rect.y > 60 && rect.width > 0 && el.children.length <= 4;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          className: (el.className?.toString?.() || '').slice(0, 100),
          text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
        }))
        .filter((x) => x.text.length > 8 && x.text.length < 500);
      const idx = bodyText.indexOf('可读性');
      return {
        url: location.href,
        readabilitySlice: idx >= 0 ? bodyText.slice(idx, idx + 3000) : null,
        hasMarkers: {
          readability: bodyText.includes('可读性'),
          complex: bodyText.includes('过于复杂'),
          splitPara: bodyText.includes('拆分长段'),
          tone: bodyText.includes('语气'),
        },
        rightSide: [...new Map(rightSide.map((x) => [x.text, x])).values()].slice(0, 60),
      };
    }`)) as Record<string, unknown>;

    logger.info('Semrush sidebar debug dump', {
      action: 'semrush.sidebar_debug',
      dump,
      apiDetails: ctx.apiDetails,
      domDetails: ctx.domDetails,
    });
  }

  /** 点击侧栏维度 Tab（中英只点第一个可见项，避免重复轮询） */
  export async function clickSemrushSidebarDimensionTab(
    widget: ReturnType<Page['locator']>,
    labels: string[],
  ): Promise<boolean> {
    for (const label of labels) {
      const tab = widget
        .locator(`[role="tab"]:has-text("${label}"), button:has-text("${label}")`)
        .first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click({ timeout: 2_500 }).catch(() => undefined);
        return true;
      }
      const hit = widget.getByText(label, { exact: true }).first();
      if (await hit.isVisible().catch(() => false)) {
        await hit.click({ timeout: 2_500 }).catch(() => undefined);
        return true;
      }
    }
    return false;
  }

  /**
   * 展开当前激活 Tab 内的折叠原句（被动语态/复杂词/随意句）与全部「展示更多」。
   * 全程用 widget.evaluate 批量点击，避免逐个 Playwright 点击 + sleep 的累计耗时。
   */
  export async function expandSemrushSidebarTabRows(
    widget: ReturnType<Page['locator']>,
  ): Promise<void> {
    const issueRowPatternSources = [
      '考虑使用主动语态|Consider using active voice',
      '最为随意|随意句子|casual sentence',
      '复杂词语|complex word',
      '填充词|filler',
      '拆分长段|long paragraph',
      '难以阅读|hard to read',
      '重写难以阅读|Rewrite hard-to-read',
    ];
    await widget
      .evaluate(
        `(patterns) => {
          const widgetEl = document.querySelector('[data-test="swa-spa-checker-widget"]');
          if (!widgetEl) return;
          const safePatterns = Array.isArray(patterns) ? patterns : [];
          const reList = safePatterns.map((p) => new RegExp(p, 'i'));

          const activePanel = widgetEl;

          const clickExpandables = (root) => {
            for (const btn of root.querySelectorAll('button[aria-expanded="false"]')) {
              btn.click();
            }
          };

          clickExpandables(activePanel);
          for (const section of activePanel.querySelectorAll('section[aria-labelledby]')) {
            clickExpandables(section);
          }
          for (const item of activePanel.querySelectorAll('[role="listitem"]')) {
            const text = (item.textContent || '').replace(/\\s+/g, ' ').trim();
            if (text.length > 120) continue;
            if (!reList.some((re) => re.test(text))) continue;
            const btn = item.querySelector('button[aria-expanded="false"]');
            if (btn) btn.click();
            else item.click();
          }
        }`,
        issueRowPatternSources,
      )
      .catch(() => undefined);
    await sleep(SEMRUSH_EXPAND_POLL_MS);

    for (let round = 0; round < 2; round += 1) {
      const clicked = await widget
        .evaluate(`() => {
          const widgetEl = document.querySelector('[data-test="swa-spa-checker-widget"]');
          if (!widgetEl) return 0;
          let n = 0;
          const isShowMore = (text) => /^(展示更多|Show more)$/i.test((text || '').trim());
          for (const el of widgetEl.querySelectorAll('button, a, [role="button"]')) {
            if (!isShowMore(el.textContent)) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            el.click();
            n += 1;
            if (n >= 8) break;
          }
          return n;
        }`)
        .catch(() => 0);
      if (!clicked) break;
      await sleep(SEMRUSH_EXPAND_POLL_MS);
    }
  }

  export async function readSemrushSidebarWidgetText(
    widget: ReturnType<Page['locator']>,
  ): Promise<string> {
    const text = await widget
      .evaluate(`() => {
        const el = document.querySelector('[data-test="swa-spa-checker-widget"]');
        return el ? (el.innerText || el.textContent || '') : '';
      }`)
      .catch(() => '');
    return typeof text === 'string' ? text : '';
  }

  export async function extractSemrushSuggestionsFromDom(
  page: Page,
  options?: { logger?: { info: (msg: string, meta?: Record<string, unknown>) => void } },
): Promise<{
    details: SemrushSuggestionDetails;
    actionableIssues: SemrushActionableIssue[];
    domUncoveredSeoKeywords?: string[];
  }> {
    let mergedDetails: SemrushSuggestionDetails = {};
    let mergedActionable: SemrushActionableIssue[] = [];
    const widget = page.locator(SEMRUSH_SWA_SELECTORS.checkerWidget).first();

    const dimensionTabGroups = [
      ['可读性', 'Readability'],
      ['语气', 'Tone'],
      ['SEO'],
    ];

    let domUncoveredSeoKeywords: string[] = [];

    const mergePartial = async () => {
      const hasQuoteActionable = (rule: string) =>
        mergedActionable.some((i) => i.rule === rule && (i.quotes?.length ?? 0) > 0);
      if (
        hasQuoteActionable('passive_voice') &&
        hasQuoteActionable('casual_sentence') &&
        hasAnySemrushSuggestions(mergedDetails)
      ) {
        return;
      }

      const tryFrame = async (frame: Frame) => {
        try {
          const partial = await extractSemrushSuggestionsFromFrame(frame);
          mergedDetails = mergeSemrushSuggestionDetails(mergedDetails, partial.details);
          mergedActionable.push(...partial.actionableIssues);
        } catch {
          /* cross-origin or detached frame */
        }
      };

      await tryFrame(page.mainFrame());
      if (hasAnySemrushSuggestions(mergedDetails) && mergedActionable.length > 0) {
        return;
      }

      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const url = frame.url();
        if (url && !/sem\.3ue\.com|semrush\.com/i.test(url)) continue;
        await tryFrame(frame);
      }
    };

    const applySidebarText = (sidebarText: string) => {
      if (!sidebarText) return;
      const parsedFromText = parseActionableIssuesFromSidebarText(sidebarText);
      mergedActionable.push(...parsedFromText);
      for (const issue of parsedFromText) {
        if (issue.rule === 'casual_sentence' && issue.quotes?.length) {
          mergedDetails.tone = [
            ...new Set([...(mergedDetails.tone ?? []), ...issue.quotes]),
          ].slice(0, 30);
        }
        if (issue.rule === 'passive_voice' && issue.quotes?.length) {
          mergedDetails.readability = [
            ...new Set([...(mergedDetails.readability ?? []), ...issue.quotes]),
          ].slice(0, 30);
        }
      }
    };

    if (!(await widget.isVisible().catch(() => false))) {
      return { details: {}, actionableIssues: [] };
    }

    for (const labels of dimensionTabGroups) {
      const tabClicked = await clickSemrushSidebarDimensionTab(widget, labels);
      if (!tabClicked) continue;

      await sleep(SEMRUSH_EXPAND_POLL_MS);

      if (labels[0] === 'SEO') {
        const uncovered = await scrapeSemrushUncoveredSeoTags(widget);
        if (uncovered.length > 0) {
          domUncoveredSeoKeywords = [
            ...new Set([...domUncoveredSeoKeywords, ...uncovered]),
          ];
        }
        applySidebarText(
          await widget.innerText({ timeout: 5_000 }).catch(() => ''),
        );
        continue;
      }

      // 可读性/语气：短轮询等原句列表渲染，再批量展开
      await pollUntil(
        async () => {
          const text = await readSemrushSidebarWidgetText(widget);
          return /主动语态|active voice|随意|casual sentence|可读性|Readability|语气|Tone/i.test(
            text,
          );
        },
        {
          timeoutMs: SEMRUSH_SIDEBAR_TAB_POLL_MS,
          intervalMs: SEMRUSH_EXPAND_POLL_MS,
          label: `SWA ${labels[0]} tab content`,
        },
      ).catch(() => undefined);

      await expandSemrushSidebarTabRows(widget);
      await sleep(1_200);
      applySidebarText(
        await widget.innerText({ timeout: 8_000 }).catch(() => ''),
      );
    }

    await mergePartial();

    if (process.env.SEMRUSH_DEBUG_SIDEBAR === '1' && !hasAnySemrushSuggestions(mergedDetails)) {
      options?.logger?.info('Semrush DOM extract empty after all frames', {
        action: 'semrush.dom_extract_empty',
        frameCount: page.frames().length,
      });
    }

    return {
      details: normalizeSemrushSuggestionDetails(mergedDetails),
      actionableIssues: dedupeActionableIssues(mergedActionable),
      domUncoveredSeoKeywords:
        domUncoveredSeoKeywords.length > 0 ? domUncoveredSeoKeywords : undefined,
    };
  }

  /** SEO Tab：灰色 Tag = 正文未覆盖（绿 Tag 为已覆盖） */
  export async function scrapeSemrushUncoveredSeoTags(
    widget: ReturnType<Page['locator']>,
  ): Promise<string[]> {
    const tagsRaw = await widget
      .evaluate(`() => {
        const widgetEl = document.querySelector('[data-test="swa-spa-checker-widget"]');
        if (!widgetEl) return [];
        const uncovered = [];
        for (const tag of widgetEl.querySelectorAll('[data-ui-name="Tag"]')) {
          const text = tag.querySelector('[data-ui-name="Tag.Text"]')?.textContent?.trim();
          if (!text || text.length < 2) continue;
          const style = window.getComputedStyle(tag);
          const bg = style.backgroundColor || '';
          const rgb = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
          let isCovered = false;
          if (rgb) {
            const r = Number(rgb[1]);
            const g = Number(rgb[2]);
            const b = Number(rgb[3]);
            isCovered = g > 110 && g > r + 15 && g > b + 15;
          }
          if (!isCovered) uncovered.push(text);
        }
        return uncovered;
      }`)
      .catch(() => []);

    const tags = Array.isArray(tagsRaw) ? (tagsRaw as string[]) : [];

    return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  }

  export async function extractSemrushSuggestionsFromFrame(frame: Frame): Promise<{
    details: SemrushSuggestionDetails;
    actionableIssues: SemrushActionableIssue[];
  }> {
    const raw = (await frame.evaluate(`() => {
      const noise =
        /免费检查|Smart Writer|已用|增加限额|重述工具|创作|询问 AI|用于本文档|设置新目标|内容推荐|SEO Writing Assistant|文档：|站点表现|竞品分析|关键词研究|跳到内容|Enterprise|我的档案|发送反馈|这有帮助吗/i;

      const normalize = (text) => (text || '').replace(/\\s+/g, ' ').trim();
      const isBulletText = (text) =>
        text.length > 6 && text.length < 800 && !noise.test(text);

      const widget = document.querySelector('[data-test="swa-spa-checker-widget"]');
      if (!widget) return {};

      const sectionMap = {
        readability: ['可读性', 'Readability'],
        seo: ['SEO'],
        tone: ['语气', 'Tone'],
        originality: ['原创性', 'Originality'],
      };

      const extractListItemText = (item) => {
        const textBoxes = item.querySelectorAll('[data-ui-name="Box"]');
        for (const box of textBoxes) {
          const style = box.getAttribute('style') || '';
          if (!style.includes('overflow-wrap')) continue;
          const tags = [...box.querySelectorAll('[data-ui-name="Tag.Text"]')]
            .map((tag) => normalize(tag.textContent))
            .filter(Boolean);
          let text = normalize(box.innerText || box.textContent);
          if (!text) continue;
          if (tags.length > 0 && /关键词|keyword/i.test(text)) {
            const prefix = text.split(tags[0])[0].trim();
            const suffix = tags.length > 8 ? \` 等 \${tags.length} 个\` : '';
            text = \`\${prefix} \${tags.slice(0, 8).join(', ')}\${suffix}\`.trim();
          }
          return text;
        }
        return normalize(item.innerText || item.textContent);
      };

      const details = {};
      for (const section of widget.querySelectorAll('section[aria-labelledby]')) {
        const titleId = section.getAttribute('aria-labelledby');
        const titleEl = titleId ? document.getElementById(titleId) : null;
        const title = normalize(titleEl?.textContent);
        if (!title) continue;

        let targetKey = null;
        for (const [key, labels] of Object.entries(sectionMap)) {
          if (labels.includes(title)) {
            targetKey = key;
            break;
          }
        }
        if (!targetKey) continue;

        const items = [...section.querySelectorAll('[role="list"] [role="listitem"]')]
          .map(extractListItemText)
          .filter(isBulletText);

        if (items.length > 0) {
          details[targetKey] = [...new Set(items)].slice(0, 20);
        }
      }

      const classifyRule = (label) => {
        if (/主动语态|active voice/i.test(label)) return 'passive_voice';
        if (/复杂|complex word/i.test(label)) return 'complex_word';
        if (/随意|casual sentence/i.test(label)) return 'casual_sentence';
        if (/移除或替换|填充|filler/i.test(label)) return 'filler_phrase';
        if (/段落|paragraph|拆分长段/i.test(label)) return 'long_paragraph';
        if (/关键词|keyword/i.test(label)) return 'keyword';
        return 'other';
      };

      const isEnglishQuote = (text) =>
        /^[A-Za-z][A-Za-z0-9\\s,'"()-]{10,320}[.!?]?$/.test(text.trim());

      const extractNumberedUnderHeader = (headerRe, maxItems = 20) => {
        const rawText = widget.innerText || widget.textContent || '';
        const idx = rawText.search(headerRe);
        if (idx < 0) return [];
        const slice = rawText.slice(idx, idx + 8000);
        const quotes = [];

        const pushQuote = (text) => {
          const q = normalize(text);
          if (isEnglishQuote(q)) quotes.push(q);
        };

        for (const m of slice.matchAll(/\\d+\\.\\s*([A-Za-z][^\\n]{8,320}?[.!?])/g)) {
          pushQuote(m[1]);
        }
        for (const m of slice.matchAll(/(?:^|\\n)\\s*\\d+\\s*\\n\\s*([A-Za-z][^\\n]{8,320}?[.!?])/gm)) {
          pushQuote(m[1]);
        }

        const normalizedSlice = normalize(slice);
        for (const m of normalizedSlice.matchAll(/\\b\\d+\\s+([A-Za-z][^.!?]{8,280}[.!?])/g)) {
          pushQuote(m[1]);
        }

        return [...new Set(quotes)].slice(0, maxItems);
      };

      const actionable = [];

      for (const section of widget.querySelectorAll('section[aria-labelledby]')) {
        const titleId = section.getAttribute('aria-labelledby');
        const titleEl = titleId ? document.getElementById(titleId) : null;
        const title = normalize(titleEl?.textContent);
        if (!title) continue;

        let targetKey = null;
        for (const [key, labels] of Object.entries(sectionMap)) {
          if (labels.includes(title)) {
            targetKey = key;
            break;
          }
        }
        if (!targetKey) continue;

        const topItems = [...section.querySelectorAll(':scope [role="list"] > [role="listitem"]')];
        for (const item of topItems) {
          const label = normalize(
            item.querySelector('[data-ui-name="Box"]')?.textContent?.split('\\n')[0] ||
              item.textContent?.split('\\n')[0],
          );
          if (!label || label.length < 4) continue;

          const terms = [...item.querySelectorAll('[data-ui-name="Tag.Text"]')]
            .map((tag) => normalize(tag.textContent))
            .filter(Boolean);

          const subQuotes = [...item.querySelectorAll(':scope [role="list"] [role="listitem"]')]
            .map(extractListItemText)
            .filter((t) => isEnglishQuote(t));

          const inlineNumbered = [
            ...normalize(item.innerText || '').matchAll(/\\d+\\.\\s*([A-Za-z][^.!?\\n]{8,280}[.!?]?)/g),
          ]
            .map((m) => normalize(m[1]))
            .filter((t) => isEnglishQuote(t));

          const quotes = [...new Set([...subQuotes, ...inlineNumbered])];
          const rule = classifyRule(label);

          if (quotes.length > 0 || terms.length > 0) {
            actionable.push({
              category: targetKey,
              rule,
              label,
              quotes: quotes.length > 0 ? quotes : undefined,
              terms: terms.length > 0 ? terms : undefined,
            });
          } else if (
            rule !== 'other' &&
            rule !== 'keyword' &&
            /考虑|重写|替换|移除|Consider|Rewrite|Replace|Remove/i.test(label)
          ) {
            actionable.push({
              category: targetKey,
              rule,
              label,
            });
          }
        }
      }

      const headerRules = [
        { re: /最为随意的句子|Most casual sentences/i, rule: 'casual_sentence', category: 'tone' },
        { re: /考虑使用主动语态|Consider using active voice/i, rule: 'passive_voice', category: 'readability' },
        { re: /考虑移除或替换|Consider removing or replacing/i, rule: 'filler_phrase', category: 'tone' },
        { re: /替换太过复杂的词语|Replace overly complex words/i, rule: 'complex_word', category: 'readability' },
      ];

      for (const { re, rule, category } of headerRules) {
        const quotes = extractNumberedUnderHeader(re, 24);
        if (quotes.length === 0) continue;
        const labelMatch = normalize(widget.innerText || '').match(re);
        actionable.push({
          category,
          rule,
          label: labelMatch ? labelMatch[0] : rule,
          quotes,
        });
      }

      const hasStructured = Object.values(details).some((items) => items?.length > 0);

      const casualSentences = extractNumberedUnderHeader(/最为随意的句子|Most casual sentences/i, 24);
      if (casualSentences.length > 0) {
        details.tone = [...new Set([...(details.tone ?? []), ...casualSentences])].slice(0, 30);
      }

      const passiveQuotes = extractNumberedUnderHeader(
        /考虑使用主动语态|Consider using active voice/i,
        16,
      );
      if (passiveQuotes.length > 0) {
        details.readability = [
          ...new Set([...(details.readability ?? []), ...passiveQuotes]),
        ].slice(0, 30);
      }

      if (!hasStructured) {
        const widgetText = normalize(widget.innerText || widget.textContent);
        for (const [key, labels] of Object.entries(sectionMap)) {
          for (const label of labels) {
            const idx = widgetText.indexOf(label);
            if (idx < 0) continue;
            const slice = widgetText.slice(idx + label.length, idx + label.length + 2500);
            const bullets = [...slice.matchAll(/[•●▪◦-]\\s*([^•●▪◦\\n]{8,400})/g)]
              .map((m) => normalize(m[1]))
              .filter(isBulletText);
            if (bullets.length > 0) {
              details[key] = [...new Set([...(details[key] ?? []), ...bullets])].slice(0, 20);
            }
          }
        }
      }

      return { details, actionable };
    }`)) as { details: SemrushSuggestionDetails; actionable: SemrushActionableIssue[] };

    return {
      details: normalizeSemrushSuggestionDetails(raw.details ?? {}),
      actionableIssues: dedupeActionableIssues(raw.actionable ?? []),
    };
  }