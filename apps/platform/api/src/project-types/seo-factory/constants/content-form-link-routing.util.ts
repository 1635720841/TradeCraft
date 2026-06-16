/** 按搜索意图与内容形态推荐内链页面类型 */

import { normalizeArticleContentForm } from './content-form';

export function resolvePreferredPageTypes(
  searchIntent?: string | null,
  contentForm?: string | null,
): string[] {
  const form = normalizeArticleContentForm(contentForm);

  if (form === 'FAQ_PAGE') {
    return ['PAGE', 'BLOG'];
  }
  if (form === 'PRODUCT_ENHANCED') {
    return ['PRODUCT', 'SERVICE', 'SOLUTION'];
  }

  switch ((searchIntent ?? '').toUpperCase()) {
    case 'COMMERCIAL':
    case 'TRANSACTIONAL':
      return ['PRODUCT', 'SERVICE', 'SOLUTION'];
    case 'BRAND':
      return ['PAGE', 'SERVICE', 'PRODUCT'];
    case 'COMPETITOR':
      return ['BLOG', 'SOLUTION', 'PAGE'];
    case 'INFORMATIONAL':
    default:
      return ['BLOG', 'PAGE', 'SOLUTION'];
  }
}

export function filterPagesByPreferredTypes<T extends { pageType: string }>(
  pages: T[],
  preferredTypes: string[],
): T[] {
  if (preferredTypes.length === 0) return pages;

  const preferred = new Set(preferredTypes.map((item) => item.toUpperCase()));
  const filtered = pages.filter((page) => preferred.has(page.pageType.toUpperCase()));
  return filtered.length > 0 ? filtered : pages;
}
