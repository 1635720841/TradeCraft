/**
 * Shopify CMS 推送：HTML 图片提取与 URL 判定。
 *
 * 边界：
 * - 不负责：Shopify Admin HTTP（ShopifyFilesService）
 */

const HTML_IMG_SRC_RE = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;

export function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export function extractHtmlImageSrcs(html: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const match of html.matchAll(HTML_IMG_SRC_RE)) {
    const raw = match[1]?.trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    items.push(raw);
  }

  return items;
}

export function isShopifyHostedImageUrl(url: string, shopDomain: string): boolean {
  const lower = decodeHtmlAttr(url).toLowerCase();
  const domain = shopDomain.toLowerCase();
  return lower.includes('cdn.shopify.com') || lower.includes(domain);
}

export function shouldRemapImageForShopify(url: string, shopDomain: string): boolean {
  const normalized = decodeHtmlAttr(url).trim();
  if (!normalized || normalized.startsWith('data:')) return false;
  return !isShopifyHostedImageUrl(normalized, shopDomain);
}

export function buildShopifyUploadFilename(index: number, sourceUrl: string, ext: string): string {
  const slugSource = sourceUrl.split('/').pop()?.split('?')[0]?.replace(/\.[^.]+$/, '') ?? 'image';
  const slug = slugSource
    .toLowerCase()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const order = String(index + 1).padStart(2, '0');
  return `seo-article-${order}-${slug || 'image'}${ext}`;
}

export function mimeTypeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.jpeg':
    case '.jpg':
    default:
      return 'image/jpeg';
  }
}
