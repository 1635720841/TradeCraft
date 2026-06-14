/**
 * BFL 生图 prompt 构建：SEO 正文插图，禁止模型绘制文字（klein 等模型易乱码）。
 */

const NO_TEXT_SUFFIX =
  'Editorial stock-style photo, clean composition, natural lighting. ' +
  'Absolutely no text, no letters, no numbers, no logos, no watermarks, no UI screens, no buttons, no labels.';

export interface BuildArticleImagePromptOptions {
  keyword: string;
  index: number;
  sectionHint?: string;
}

/** 从正文提取首个 H2 作为场景提示（不含 Markdown 图片行） */
export function extractFirstSectionHint(content: string): string | undefined {
  const match = content.match(/^##\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading && heading.length >= 2 ? heading.slice(0, 80) : undefined;
}

export function buildArticleImagePrompt(options: BuildArticleImagePromptOptions): string {
  const subject = options.sectionHint?.trim() || options.keyword.trim();
  const scene = `${subject}, ${options.keyword} industry context, image ${options.index + 1}`;
  return `${scene}. ${NO_TEXT_SUFFIX}`;
}

export function buildArticleImageAlt(keyword: string, sectionHint?: string): string {
  const base = sectionHint?.trim() || keyword.trim();
  return `${base} — ${keyword}`.slice(0, 120);
}
