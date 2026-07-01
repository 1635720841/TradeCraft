/**
 * 配图展示：合并 articleImages 元数据与正文 Markdown 兜底。
 */

import type { ArticleJobArticleImage } from "@/api/seo-factory/types";

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const MEDIA_ASSET_URL_RE = /\/media\/([0-9a-f-]{36})\/file/i;

const PLACEHOLDER_IMAGE_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "placehold.co",
  "via.placeholder.com"
]);

export function isPlaceholderImageUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized || normalized === "#" || /^IMAGE_PLACEHOLDER$/i.test(normalized)) {
    return true;
  }
  if (MEDIA_ASSET_URL_RE.test(normalized)) return false;
  if (/delivery\..*bfl\.ai|api\.bfl\.ai/i.test(normalized)) return false;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (PLACEHOLDER_IMAGE_HOSTS.has(host)) return true;
    if (host.includes("placeholder")) return true;
  } catch {
    return !normalized.startsWith("/");
  }

  return false;
}

function inferImageSource(url: string): ArticleJobArticleImage["source"] {
  if (MEDIA_ASSET_URL_RE.test(url)) return "bfl";
  if (/^https?:\/\//i.test(url)) {
    if (/delivery\..*bfl\.ai|api\.bfl\.ai/i.test(url)) return "bfl";
    return "url";
  }
  return "bfl";
}

function parseAssetId(url: string): string | undefined {
  return url.match(MEDIA_ASSET_URL_RE)?.[1];
}

export function extractImagesFromMarkdown(content: string): ArticleJobArticleImage[] {
  const seen = new Set<string>();
  const items: ArticleJobArticleImage[] = [];
  let match = MARKDOWN_IMAGE_RE.exec(content);
  while (match) {
    const alt = match[1]?.trim() ?? "";
    const url = match[2]?.trim() ?? "";
    if (url && !seen.has(url) && !isPlaceholderImageUrl(url)) {
      seen.add(url);
      const assetId = parseAssetId(url);
      items.push({
        alt,
        url,
        ...(assetId ? { assetId } : {}),
        source: inferImageSource(url)
      });
    }
    match = MARKDOWN_IMAGE_RE.exec(content);
  }
  return items;
}

export function resolveArticleImagesForDisplay(
  content: string | null | undefined,
  articleImages?: ArticleJobArticleImage[] | null
): ArticleJobArticleImage[] {
  const fromMeta = (articleImages ?? []).filter((image) => !isPlaceholderImageUrl(image.url));
  const fromMarkdown = content ? extractImagesFromMarkdown(content) : [];
  if (!fromMeta.length) return fromMarkdown;
  if (!fromMarkdown.length) return fromMeta;

  const byUrl = new Map(fromMeta.map((image) => [image.url.trim(), image]));
  return fromMarkdown.map((image) => byUrl.get(image.url) ?? image);
}

export function countArticleImagesForDisplay(
  content: string | null | undefined,
  articleImages?: ArticleJobArticleImage[] | null
): number {
  return resolveArticleImagesForDisplay(content, articleImages).length;
}
