/** 搜索意图：入队快照 + Brief/Draft Prompt 分支指引 */

export const KEYWORD_INTENT_VALUES = [
  'INFORMATIONAL',
  'COMMERCIAL',
  'TRANSACTIONAL',
  'BRAND',
  'COMPETITOR',
] as const;

export type KeywordIntentValue = (typeof KEYWORD_INTENT_VALUES)[number];

export function normalizeKeywordIntent(
  value?: string | null,
): KeywordIntentValue {
  const upper = String(value ?? 'INFORMATIONAL').toUpperCase();
  if ((KEYWORD_INTENT_VALUES as readonly string[]).includes(upper)) {
    return upper as KeywordIntentValue;
  }
  return 'INFORMATIONAL';
}

/** Brief/Draft Prompt 用的 lowercase 标签 */
export function searchIntentPromptLabel(intent: KeywordIntentValue): string {
  return intent.toLowerCase();
}

/** 按意图注入 Brief/Draft 的结构化写作要求（英文，供 LLM 执行） */
export function getSearchIntentGuidelines(intent: KeywordIntentValue): string {
  switch (intent) {
    case 'COMMERCIAL':
      return [
        'Commercial investigation intent: reader compares options before contacting supplier.',
        'Include at least one comparison or specification section (table or bullet list).',
        'Cover MOQ, lead time, certifications (ISO/CE/UL as relevant), and application scenarios.',
        'Tone: professional B2B manufacturer/trader; avoid hype without evidence.',
        'End with a soft CTA block: Request a Quote / Contact Our Engineer.',
      ].join('\n');
    case 'TRANSACTIONAL':
      return [
        'Transactional intent: reader is close to purchase or inquiry.',
        'Keep copy concise; lead with value proposition and trust signals in first 2 paragraphs.',
        'Include FAQ section (4–6 questions) for PAA / snippet capture.',
        'Strong CTA: Request a Quote, Download Catalog, or Contact Sales — one primary CTA.',
        'Highlight pricing factors, MOQ, payment/shipping basics without inventing numbers.',
      ].join('\n');
    case 'BRAND':
      return [
        'Brand intent: reinforce company credibility and differentiation.',
        'Emphasize company history, capabilities, quality process, and customer success.',
        'Include trust elements: certifications, factory/process overview, service scope.',
        'Avoid aggressive competitor attacks; focus on your strengths.',
      ].join('\n');
    case 'COMPETITOR':
      return [
        'Competitor comparison intent: fair, factual comparison framing.',
        'Use comparison table or pros/cons structure; do not invent competitor specs.',
        'Focus on selection criteria buyers use (quality, lead time, support, compliance).',
        'Position your offering via objective criteria, not unsubstantiated superlatives.',
      ].join('\n');
    case 'INFORMATIONAL':
    default:
      return [
        'Informational intent: educate and build authority.',
        'Prioritize clear explanations, use cases, and step-by-step guidance.',
        'Include at least one bullet list and practical takeaways.',
        'Soft CTA at end: Learn more / Contact us for custom solutions.',
      ].join('\n');
  }
}
