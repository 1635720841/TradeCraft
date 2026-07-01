/**
 * 正文 Markdown 图片计数与记录类型。
 */

export type ArticleImageSource = 'bfl' | 'upload' | 'url';

export interface ArticleImageRecord {
  alt: string;
  url: string;
  assetId?: string;
  source: ArticleImageSource;
  insertAfterHeading?: string;
}

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const MEDIA_ASSET_URL_RE = /\/media\/([0-9a-f-]{36})\/file/i;
const PLACEHOLDER_IMAGE_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'localhost',
  'placehold.co',
  'via.placeholder.com',
]);

/** LLM 初稿占位图 URL（非媒体库 / 非 BFL 真实地址） */
export function isPlaceholderImageUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized || normalized === '#' || /^IMAGE_PLACEHOLDER$/i.test(normalized)) {
    return true;
  }
  if (MEDIA_ASSET_URL_RE.test(normalized)) return false;
  if (/delivery\..*bfl\.ai|api\.bfl\.ai/i.test(normalized)) return false;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (PLACEHOLDER_IMAGE_HOSTS.has(host)) return true;
    if (host.includes('placeholder')) return true;
  } catch {
    return !normalized.startsWith('/');
  }

  return false;
}

export function countEffectiveMarkdownImages(content: string): number {
  return extractMarkdownImageRecords(content).filter((image) => !isPlaceholderImageUrl(image.url))
    .length;
}

/** 移除正文中的占位图 Markdown，保留媒体库 / BFL 等真实配图 */
export function stripPlaceholderMarkdownImages(content: string): string {
  return content
    .replace(MARKDOWN_IMAGE_RE, (full, _alt: string, url: string) =>
      isPlaceholderImageUrl(url) ? '' : full,
    )
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function inferImageSource(url: string): ArticleImageSource {
  const normalized = url.trim();
  if (MEDIA_ASSET_URL_RE.test(normalized)) {
    if (/\/upload|source=upload/i.test(normalized)) return 'upload';
    return 'bfl';
  }
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    if (/delivery\..*bfl\.ai|api\.bfl\.ai/i.test(normalized)) return 'bfl';
    return 'url';
  }
  return 'bfl';
}

function parseMediaAssetId(url: string): string | undefined {
  const match = url.trim().match(MEDIA_ASSET_URL_RE);
  return match?.[1];
}

/** 从正文 Markdown 提取配图记录（元数据缺失时的兜底） */
export function extractMarkdownImageRecords(content: string): ArticleImageRecord[] {
  const seen = new Set<string>();
  const records: ArticleImageRecord[] = [];
  const pattern = new RegExp(MARKDOWN_IMAGE_RE.source, 'g');
  let match = pattern.exec(content);
  while (match) {
    const alt = match[1]?.trim() ?? '';
    const url = match[2]?.trim() ?? '';
    if (!url || seen.has(url)) {
      match = pattern.exec(content);
      continue;
    }
    seen.add(url);
    const assetId = parseMediaAssetId(url);
    records.push({
      alt,
      url,
      ...(assetId ? { assetId } : {}),
      source: inferImageSource(url),
    });
    match = pattern.exec(content);
  }
  return records;
}

/** 以元数据为准，并用正文 Markdown 补全缺失项 */
export function reconcileArticleImagesFromContent(
  content: string,
  existing?: ArticleImageRecord[],
): ArticleImageRecord[] {
  const fromMarkdown = extractMarkdownImageRecords(content);
  if (!existing?.length) return fromMarkdown;
  if (!fromMarkdown.length) return existing;

  const byUrl = new Map(existing.map((image) => [image.url.trim(), image]));
  return fromMarkdown.map((image) => byUrl.get(image.url) ?? image);
}

export function collectArticleImageAssetIds(images: ArticleImageRecord[]): string[] {
  return images
    .map((image) => image.assetId)
    .filter((assetId): assetId is string => Boolean(assetId));
}

export function countMarkdownImages(content: string): number {
  return (content.match(MARKDOWN_IMAGE_RE) ?? []).length;
}

/** 移除正文中全部 Markdown 图片（重跑自动配图前清理遗留插图） */
export function stripAllMarkdownImages(content: string): string {
  return content
    .replace(MARKDOWN_IMAGE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
