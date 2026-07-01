/**
 * BFL 生图 prompt 构建：SEO 正文插图。
 *
 * FLUX.2 Klein 不支持 negative prompt；用正向画面描述避免乱码文字。
 * 章节标题转写为可拍主体，不直接引用标题原文（防模型把标题画进图里）。
 * 避免 BMS/UAV 等缩写——模型易将其渲染为设备上的印刷字样。
 */

type SectionIntent = 'overview' | 'mechanism' | 'application' | 'generic';

const SHOT_BY_INTENT: Record<SectionIntent, readonly string[]> = {
  overview: [
    'Professional product photograph of {subject} arranged on a clean white engineering workbench',
    'Wide establishing shot of {subject} in a bright aerospace testing laboratory',
  ],
  mechanism: [
    'Macro close-up of {subject} showing internal wiring solder joints and connector pins',
    'Exploded-view style arrangement of {subject} components on a neutral gray surface',
  ],
  application: [
    'Medium shot of {subject} deployed in a real-world operational environment',
    'Environmental portrait of {subject} in active field use with natural daylight',
  ],
  generic: [
    'Professional product photograph of {subject} in a modern technical workspace',
    'Close-up detail shot of {subject} components and materials',
    'Medium shot showing {subject} equipment in a commercial industrial setting',
  ],
};

/** 正向约束：描述「干净无标识的画面」，避免写 "no text" 触发文字渲染 */
const VISUAL_STYLE_SUFFIX =
  'Photorealistic editorial stock photo, soft natural lighting, clean composition, ' +
  'sharp focus, smooth unmarked surfaces, blank screens and panels, ' +
  'unlabeled bare components with no printed letters numbers or logos on any surface, ' +
  'signage-free environment, typography-free image';

/** 常见 SEO 章节标题前缀（去掉后保留主题词） */
const SECTION_PREFIX_RE =
  /^(what\s+(?:is|are)\s+(?:a[n]?\s+)?|how\s+(?:to|do|does)\s+(?:a[n]?\s+)?|why\s+(?:is|are|do|does)\s+(?:a[n]?\s+)?|when\s+(?:to|should)\s+|where\s+(?:to|can)\s+|top\s+\d+\s+|guide\s+to\s+|understanding\s+|introduction\s+to\s+|benefits\s+of\s+|types\s+of\s+|best\s+practices\s+for\s+)/i;

export interface BuildArticleImagePromptOptions {
  keyword: string;
  index: number;
  sectionHint?: string;
}

/** 从正文提取首个 H2（用于 Alt） */
export function extractFirstSectionHint(content: string): string | undefined {
  const match = content.match(/^##\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading && heading.length >= 2 ? heading.slice(0, 80) : undefined;
}

/** 章节标题 → 可拍主体（去问号/编号，不保留 "What is" 等疑问句式） */
export function sanitizeSectionForVisual(sectionHint: string): string {
  return sectionHint
    .replace(/^\d+[\).\s-]+/, '')
    .replace(SECTION_PREFIX_RE, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/\?+$/g, '')
    .replace(/\s+(work|works|function|functions)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferSectionIntent(sectionHint?: string): SectionIntent {
  const raw = sectionHint?.trim().toLowerCase() ?? '';
  if (/^what\s+(?:is|are)\b/.test(raw)) return 'overview';
  if (/^how\s+(?:does|do)\b/.test(raw)) return 'mechanism';
  if (/^(?:why|when|where|benefits|types|top|best)\b/.test(raw)) return 'application';
  return 'generic';
}

/**
 * 从关键词/章节推断具象画面名词（全拼写，不用易触发印刷的缩写）。
 */
export function inferDomainVisualNouns(
  keyword: string,
  sectionHint?: string,
  intent: SectionIntent = 'generic',
): string | undefined {
  const hay = [keyword, sectionHint, sectionHint ? sanitizeSectionForVisual(sectionHint) : '']
    .join(' ')
    .toLowerCase();

  const hasDrone = /\b(uav|drone|quadcopter|unmanned aerial|multirotor)\b/.test(hay);
  const hasBms = /\b(bms|battery management)\b/.test(hay);
  const hasBattery = /\b(battery|lithium|li-ion|lipo|cell|cells)\b/.test(hay);

  if (hasDrone && hasBms) {
    if (intent === 'mechanism') {
      return (
        'lithium battery cells wired to a compact green printed circuit board ' +
        'with balance leads and gold power connectors'
      );
    }
    if (intent === 'overview') {
      return (
        'multirotor quadcopter drone beside a detachable lithium polymer battery pack ' +
        'with visible power management electronics'
      );
    }
    return (
      'multirotor quadcopter drone with lithium polymer battery pack ' +
      'and battery management printed circuit board'
    );
  }

  if (hasDrone) {
    return 'commercial quadcopter drone with propellers on a clean workbench';
  }

  if (hasBms || (hasBattery && /\bmanagement\b/.test(hay))) {
    if (intent === 'mechanism') {
      return (
        'lithium battery cells connected to a small printed circuit board ' +
        'with ribbon cables and power connectors'
      );
    }
    return 'lithium polymer battery pack with integrated power management circuit board';
  }

  return undefined;
}

/**
 * 组合关键词与章节主题为具象画面主体（优先领域名词，避免缩写进 prompt）。
 */
export function buildVisualSubject(
  keyword: string,
  sectionHint?: string,
  intent: SectionIntent = 'generic',
): string {
  const domain = inferDomainVisualNouns(keyword, sectionHint, intent);
  if (domain) return domain;

  const kw = keyword.trim();
  const section = sectionHint?.trim() ? sanitizeSectionForVisual(sectionHint) : '';
  if (!section) {
    return `${kw} equipment and components`;
  }
  const sectionLower = section.toLowerCase();
  const kwLower = kw.toLowerCase();
  if (sectionLower.includes(kwLower) || kwLower.includes(sectionLower.slice(0, Math.min(6, sectionLower.length)))) {
    return `${section} equipment and components`;
  }
  return `${section} related to ${kw}, showing ${kw} equipment`;
}

/** 统一为所有生图 prompt 追加正向视觉约束（手动/自动入口均经此函数） */
export function finalizeArticleImagePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('typography-free image') || trimmed.includes('signage-free environment')) {
    return trimmed;
  }
  return `${trimmed}. ${VISUAL_STYLE_SUFFIX}`;
}

export function buildArticleImagePrompt(options: BuildArticleImagePromptOptions): string {
  const keyword = options.keyword.trim();
  const intent = inferSectionIntent(options.sectionHint);
  const subject = buildVisualSubject(keyword, options.sectionHint, intent);
  const templates = SHOT_BY_INTENT[intent];
  const template = templates[options.index % templates.length];
  const core = template.replace('{subject}', subject);
  return finalizeArticleImagePrompt(core);
}

export function buildArticleImageAlt(keyword: string, sectionHint?: string): string {
  const base = sectionHint?.trim() || keyword.trim();
  return `${base} — ${keyword}`.slice(0, 120);
}
