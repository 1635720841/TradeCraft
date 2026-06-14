/**
 * 内容输出语言：与 SERP locale、LLM 输出语言对齐。
 */

export const CONTENT_LANGUAGES = [
  { value: 'en', label: 'English', serpLocale: 'en' },
  { value: 'zh-CN', label: '简体中文', serpLocale: 'zh-cn' },
] as const;

export type ContentLanguageCode = (typeof CONTENT_LANGUAGES)[number]['value'];

export function normalizeContentLanguage(code?: string | null): ContentLanguageCode {
  if (code === 'zh-CN' || code === 'zh-cn' || code === 'zh') {
    return 'zh-CN';
  }
  return 'en';
}

export function getContentLanguageLabel(code?: string | null): string {
  const normalized = normalizeContentLanguage(code);
  return CONTENT_LANGUAGES.find((item) => item.value === normalized)?.label ?? 'English';
}

export function resolveSerpLocale(contentLanguage?: string | null): string {
  const normalized = normalizeContentLanguage(contentLanguage);
  return CONTENT_LANGUAGES.find((item) => item.value === normalized)?.serpLocale ?? 'en';
}

export function defaultBrandVoice(contentLanguage?: string | null): string {
  return normalizeContentLanguage(contentLanguage) === 'zh-CN'
    ? '专业、可信'
    : 'professional, trustworthy';
}
