/** 文章内容形态：驱动 Brief/Draft 结构与内链路由 */

export const ARTICLE_CONTENT_FORMS = ['ARTICLE', 'PRODUCT_ENHANCED', 'FAQ_PAGE'] as const;

export type ArticleContentForm = (typeof ARTICLE_CONTENT_FORMS)[number];

export function normalizeArticleContentForm(value: unknown): ArticleContentForm {
  if (typeof value === 'string' && ARTICLE_CONTENT_FORMS.includes(value as ArticleContentForm)) {
    return value as ArticleContentForm;
  }
  return 'ARTICLE';
}

export function contentFormPromptLabel(form: ArticleContentForm): string {
  switch (form) {
    case 'PRODUCT_ENHANCED':
      return 'product-enhanced article';
    case 'FAQ_PAGE':
      return 'FAQ landing page';
    default:
      return 'standard SEO article';
  }
}

export function getContentFormGuidelines(form: ArticleContentForm): string {
  switch (form) {
    case 'PRODUCT_ENHANCED':
      return [
        '- Lead with buyer pain points and product/application fit (B2B industrial tone)',
        '- Include specs comparison table, MOQ/lead-time callouts, and certification mentions when relevant',
        '- Strong commercial CTA in closing; link to product/service pages where natural',
        '- Still pass readability rules — shorter sentences over marketing fluff',
      ].join('\n');
    case 'FAQ_PAGE':
      return [
        '- Structure as FAQ-first: H1 + intro (≤120 words) then ## FAQ with 6–10 Q&A pairs',
        '- Each answer 2–4 sentences; direct and snippet-friendly',
        '- Include one short “when to contact us” section before CTA',
        '- Target featured snippets: definition-style answers for top questions',
      ].join('\n');
    default:
      return '- Standard long-form SEO article with ≥4 H2 sections and informational depth.';
  }
}
