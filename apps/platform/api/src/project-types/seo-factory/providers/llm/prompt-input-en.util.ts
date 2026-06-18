/**
 * 将注入 LLM Prompt 的中文建议/明细转为英文；UI 与日志仍保留中文原文。
 *
 * 边界：
 * - 不负责：Prompt 模板文件（prompts/*.md）
 *
 * 入口：
 * - toEnglishPromptSuggestions
 * - toEnglishPromptScoreBreakdown
 */

const SUGGESTION_EXACT: Record<string, string> = {
  '在正文开头前 200 个字符内自然出现目标关键词（完整短语）':
    'Place the full target keyword naturally within the first 200 characters',
  '调整关键词密度至约 0.8%–2.5%': 'Adjust keyword density to roughly 0.8%–2.5%',
  '关键词出现过少或堆砌，请调整密度至约 0.8%–2.5%':
    'Keyword density is too low or too high — aim for roughly 0.8%–2.5%',
  '至少在一个 H2 标题中包含目标关键词': 'Include the target keyword in at least one H2 heading',
  '增加 H2 章节至至少 4 个': 'Add at least 4 H2 sections',
  '适当使用列表提升可读性与结构得分': 'Add a bullet list to improve readability and structure score',
  '拆分长段（Semrush 可读性：单段建议不超过约 65 词）':
    'Split long paragraphs (Semrush readability: aim for ≤65 words per paragraph)',
  '重写难以阅读的句子（Semrush：单句建议 ≤22 词）':
    'Rewrite hard-to-read sentences (Semrush: aim for ≤22 words per sentence)',
  '考虑使用主动语态（减少被动句）': 'Use more active voice (reduce passive sentences)',
  '删除 it is / there is 等填充词': 'Remove filler phrases like "it is" / "there is"',
  '替换太过复杂的词语（用 use/help/start 等常用词）':
    'Replace overly complex words (prefer use/help/start over utilize/facilitate/commence)',
  '简化全文表述，降低阅读复杂度': 'Simplify wording across the article to lower reading complexity',
  '正文建议不少于 700 词': 'Aim for at least 700 words in the body',
  '补充术语与实体词覆盖（用短句表达，勿为凑词数写长段）':
    'Add more terminology and entity coverage (use short sentences, not long filler paragraphs)',
  '您的文本似乎过于复杂。请考虑简化文本。':
    'Your text seems too complex. Consider simplifying it.',
  '拆分长段。': 'Split long paragraphs.',
  '重写难以阅读的句子。': 'Rewrite hard-to-read sentences.',
  '考虑使用主动语态。': 'Consider using active voice.',
  '替换太过复杂的词语。': 'Replace overly complex words.',
  '您的文本比表现最佳的竞争对手的文本长。请考虑缩短文本。':
    'Your text is longer than top-performing competitors. Consider shortening it.',
  '您的文章尚无标题。将其添加为第一段。': 'Your article has no title. Add it as the first heading.',
  '您的标题超过 60 个字符。在搜索结果中显示时，标题能被截断。':
    'Your title exceeds 60 characters. It may be truncated in search results.',
  '在您的帖子中添加链接可以使其对读者更具权威性和实用性。':
    'Add links to make the post more authoritative and useful for readers.',
  '使用图片丰富您的文字，增强对读者的吸引力。':
    'Use images to enrich the text and engage readers.',
  '重写非常随意的句子。': 'Rewrite overly casual sentences.',
  '考虑移除或替换填充词。': 'Consider removing or replacing filler words.',
  '[可读性·必做] 全文每段 ≤60 词（2–3 句）；技术枚举改列表，避免 SWA 编辑器标紫「段落太长」':
    'Split every paragraph to ≤60 words (2–3 sentences); use lists for enumerations — avoid SWA “paragraph too long” highlights',
  '（无具体条目，请按可读性、去 AI 感与原创性整体润色）':
    '(No specific items — improve readability, reduce AI tone, and strengthen originality globally)',
  '（无额外实体词，保持现有术语覆盖）':
    '(No additional entity terms — maintain current terminology coverage)',
};

const SUGGESTION_PATTERNS: Array<{ pattern: RegExp; replace: (match: RegExpMatchArray) => string }> = [
  {
    pattern: /^补充 SERP 高频实体词：(.+)$/,
    replace: (m) => `Add missing high-frequency SERP entity terms: ${m[1]!.replace(/、/g, ', ')}`,
  },
  {
    pattern: /^正文偏长（约 (\d+) 词），Semrush 建议控制在目标 (\d+) 词的 105% 以内$/,
    replace: (m) =>
      `Body is too long (~${m[1]} words) — Semrush recommends staying within 105% of target ${m[2]} words`,
  },
  {
    pattern: /^正文过长（约 (\d+) 词），须删减以符合 Semrush 竞品长度（目标约 (\d+) 词）$/,
    replace: (m) =>
      `Body is too long (~${m[1]} words) — trim to match competitor length (target ~${m[2]} words)`,
  },
  {
    pattern: /^正文篇幅偏短（当前约 (\d+) 词，目标 (\d+)）$/,
    replace: (m) => `Body is short (~${m[1]} words, target ${m[2]})`,
  },
  {
    pattern: /^正文过短（当前约 (\d+) 词，目标 (\d+)）$/,
    replace: (m) => `Body is too short (~${m[1]} words, target ${m[2]})`,
  },
  {
    pattern: /^请考虑撰写更多文本。当前词语数为 (\d+)，共 (\d+) 个。$/,
    replace: (m) => `Consider writing more text. Current word count is ${m[1]}, target is ${m[2]}.`,
  },
  {
    pattern: /^请考虑撰写更多文本。当前词语数约 (\d+)。$/,
    replace: (m) => `Consider writing more text. Current word count is about ${m[1]}.`,
  },
  {
    pattern: /^添加推荐关键词: (.+)$/,
    replace: (m) => `Add recommended keywords: ${m[1]!.replace(/ 等 (\d+) 个$/, ' and $1 more')}`,
  },
  {
    pattern: /^目标关键词: (.+)$/,
    replace: (m) => `Target keywords: ${m[1]}`,
  },
  {
    pattern: /^\[可读性·必做\] 当前约 (\d+) 词，Semrush 竞品标杆约 (\d+) 词：须增补至 (\d+)–(\d+) 词（加案例\/FAQ\/对比表，禁止废话堆砌）$/,
    replace: (m) =>
      `[Readability·MUST] ~${m[1]} words now, competitor benchmark ~${m[2]}: expand to ${m[3]}–${m[4]} words (add cases/FAQ/comparison tables, no fluff)`,
  },
  {
    pattern: /^语气形式: (.+)$/,
    replace: (m) => `Formality level: ${m[1]}`,
  },
  {
    pattern: /^\[语气·必做\] 改写此随意句: (.+)$/,
    replace: (m) => `[Tone·MUST] Rewrite this casual sentence: ${m[1]}`,
  },
  {
    pattern: /^\[SEO·必做\] SWA 推荐词须各至少出现 1 次（自然嵌入）: (.+)$/,
    replace: (m) => `[SEO·MUST] Each SWA recommended term ≥1× (natural placement): ${m[1]}`,
  },
  {
    pattern: /^\[可读性·必做\] 拆分超长段（(\d+) 词）: "(.+)"$/,
    replace: (m) => `[Readability·MUST] Split long paragraph (${m[1]} words): "${m[2]}"`,
  },
  {
    pattern: /^\[可读性·必做\] 将超长句从 (\d+) 条压到 ≤2 条（单句 ≤22 词）$/,
    replace: (m) =>
      `[Readability·MUST] Reduce long sentences from ${m[1]} to ≤2 (each sentence ≤22 words)`,
  },
  {
    pattern: /^\[Semrush·必做\] Overall ([\d.]+)\/10，距 ([\d.]+) 仅差 ([\d.]+)：逐项落实侧栏所有红点，优先拆段与语气$/,
    replace: (m) =>
      `[Semrush·MUST] Overall ${m[1]}/10, only ${m[3]} below ${m[2]} — fix every sidebar red dot; split paragraphs and tone first`,
  },
  {
    pattern: /^\[Semrush\] Overall ([\d.]+)\/10，目标 ≥([\d.]+)：按侧栏建议逐项修改$/,
    replace: (m) => `[Semrush] Overall ${m[1]}/10, target ≥${m[2]} — implement every sidebar item`,
  },
];

/** 单条建议转英文（已是英文则原样返回） */
export function toEnglishPromptSuggestion(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return trimmed;

  const exact = SUGGESTION_EXACT[trimmed];
  if (exact) return exact;

  for (const { pattern, replace } of SUGGESTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return replace(match);
  }

  return trimmed;
}

/** 批量建议转英文，供 LLM Prompt 使用 */
export function toEnglishPromptSuggestions(lines: string[]): string[] {
  return lines.map(toEnglishPromptSuggestion);
}

/** 本地评分明细转英文，供 LLM Prompt 使用 */
export function toEnglishPromptScoreBreakdown(breakdown: string): string {
  const trimmed = breakdown.trim();
  if (!trimmed) {
    return '(No breakdown — apply optimization suggestions and cover every SERP entity term)';
  }

  if (/^Current total \d+\/100/m.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .replace(/^当前总分 (\d+)\/100$/m, 'Current total $1/100')
    .replace(
      /^- 关键词 (\d+)\/25（开篇含词 \+ 密度 0\.8–2\.5% \+ H2 含关键词）$/m,
      '- Keyword coverage $1/25 (opening keyword + density 0.8–2.5% + keyword in H2)',
    )
    .replace(
      /^- SERP 词 (\d+)\/25（已对齐 (\d+)\/(\d+)）$/m,
      '- SERP entities $1/25 (matched $2/$3)',
    )
    .replace(/^- 结构 (\d+)\/20（H2≥4 \+ 篇幅 70–105% \+ 列表）$/m, '- Structure $1/20 (H2≥4 + length 70–105% + bullet list)')
    .replace(/^- 可读性 (\d+)\/20（短段短句、少被动）$/m, '- Readability $1/20 (short paragraphs/sentences, less passive voice)')
    .replace(/^- 深度 (\d+)\/10（≥700 词 \+ 术语丰富）$/m, '- Content depth $1/10 (≥700 words + terminology richness)')
    .replace(
      /^- 尚未覆盖的 SERP 词（须原词写入）：(.+)$/m,
      (_, terms: string) => `- Missing SERP terms (use exact form): ${terms.replace(/、/g, ', ')}`,
    )
    .replace(
      /^（无明细；按优化建议与 SERP 实体词列表逐项落实）$/,
      '(No breakdown — apply optimization suggestions and cover every SERP entity term)',
    );
}
