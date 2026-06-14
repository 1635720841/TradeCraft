/**
 * M10 导出资产包：HTML + JSON-LD + 图片文件夹 → zip。
 *
 * 边界：
 * - 不负责：对象存储读写（ExportService）
 */

import { fetch } from 'undici';
import { zipSync, strToU8 } from 'fflate';
import type { ArticleImageRecord } from '../illustration/article-image.util';

const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

export interface ExportPackageImageEntry {
  originalUrl: string;
  relativePath: string;
  alt: string;
}

export interface BuildExportPackageInput {
  targetKeyword: string;
  title: string;
  metaDescription?: string;
  siteDomain: string;
  exportedAt: string;
  html: string;
  jsonLdText: string;
  manifestText?: string;
  articleImages?: ArticleImageRecord[];
  contentMarkdown?: string;
  /** 优先从对象存储读取稿件正文插图（相对 API 路径） */
  fetchImage?: (url: string) => Promise<{ body: Buffer; contentType?: string } | null>;
}

export interface BuildExportPackageResult {
  buffer: Buffer;
  fileName: string;
  imageCount: number;
}

export function slugifyExportBaseName(keyword: string): string {
  const slug = keyword
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'article';
}

export function collectExportImageSources(
  articleImages: ArticleImageRecord[] | undefined,
  contentMarkdown: string | undefined,
): Array<{ url: string; alt: string }> {
  const seen = new Set<string>();
  const items: Array<{ url: string; alt: string }> = [];

  const push = (url: string, alt: string) => {
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push({ url: normalized, alt: alt.trim() });
  };

  for (const image of articleImages ?? []) {
    push(image.url, image.alt);
  }

  if (contentMarkdown) {
    for (const match of contentMarkdown.matchAll(MARKDOWN_IMAGE_RE)) {
      const alt = match[1] ?? '';
      const url = match[2] ?? '';
      push(url, alt);
    }
  }

  return items;
}

export function buildImageRelativePath(index: number, alt: string, ext: string): string {
  const slug = slugifyExportBaseName(alt || `image-${index + 1}`);
  const order = String(index + 1).padStart(2, '0');
  return `images/${order}-${slug}${ext}`;
}

export function resolveImageExtension(url: string, contentType?: string): string {
  const fromMime = contentType?.split(';')[0]?.trim().toLowerCase();
  if (fromMime === 'image/jpeg') return '.jpg';
  if (fromMime === 'image/png') return '.png';
  if (fromMime === 'image/webp') return '.webp';
  if (fromMime === 'image/gif') return '.gif';

  const pathname = url.split('?')[0]?.toLowerCase() ?? '';
  if (pathname.endsWith('.png')) return '.png';
  if (pathname.endsWith('.webp')) return '.webp';
  if (pathname.endsWith('.gif')) return '.gif';
  if (pathname.endsWith('.jpeg') || pathname.endsWith('.jpg')) return '.jpg';
  return '.jpg';
}

export function replaceImageSrcInHtml(html: string, entries: ExportPackageImageEntry[]): string {
  let next = html;
  for (const entry of entries) {
    next = next.split(entry.originalUrl).join(entry.relativePath);
  }
  return next;
}

export function buildMetaTxt(input: {
  title: string;
  targetKeyword: string;
  metaDescription?: string;
  siteDomain: string;
  exportedAt: string;
  imageCount: number;
}): string {
  const lines = [
    `Title: ${input.title}`,
    `Keyword: ${input.targetKeyword}`,
    `Site: ${input.siteDomain}`,
    `Description: ${input.metaDescription ?? input.title}`,
    `Exported: ${input.exportedAt}`,
    `Images: ${input.imageCount} file(s) in images/`,
  ];
  return `${lines.join('\n')}\n`;
}

export function buildPackageReadmeTxt(): string {
  return [
    'SEO 文章资产包',
    '',
    '1. 将 article.html 正文复制到 WordPress / SaaS 建站 HTML 模块',
    '2. images/ 文件夹请一并上传，并保持 HTML 中的相对路径',
    '3. article.jsonld 可粘贴到页面结构化数据（Schema）区块',
    '4. meta.txt 为运营备注，无需上传到线上',
    '',
  ].join('\n');
}

export async function fetchRemoteImage(
  url: string,
  timeoutMs = 30_000,
): Promise<{ body: Buffer; contentType?: string } | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'wm-seo-factory-export/1.0' },
    });

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? undefined;
    return { body: Buffer.from(arrayBuffer), contentType };
  } catch {
    return null;
  }
}

export async function buildExportPackageZip(
  input: BuildExportPackageInput,
): Promise<BuildExportPackageResult> {
  const imageSources = collectExportImageSources(input.articleImages, input.contentMarkdown);
  const zipEntries: Record<string, Uint8Array> = {};
  const htmlReplacements: ExportPackageImageEntry[] = [];
  let downloadedCount = 0;

  for (let index = 0; index < imageSources.length; index += 1) {
    const source = imageSources[index];
    const fetched =
      (input.fetchImage ? await input.fetchImage(source.url) : null) ??
      (await fetchRemoteImage(source.url));
    if (!fetched) continue;

    const ext = resolveImageExtension(source.url, fetched.contentType);
    const relativePath = buildImageRelativePath(index, source.alt, ext);
    zipEntries[relativePath] = new Uint8Array(fetched.body);
    htmlReplacements.push({
      originalUrl: source.url,
      relativePath,
      alt: source.alt,
    });
    downloadedCount += 1;
  }

  const html = replaceImageSrcInHtml(input.html, htmlReplacements);

  zipEntries['article.html'] = strToU8(html);
  zipEntries['article.jsonld'] = strToU8(input.jsonLdText);
  zipEntries['meta.txt'] = strToU8(
    buildMetaTxt({
      title: input.title,
      targetKeyword: input.targetKeyword,
      metaDescription: input.metaDescription,
      siteDomain: input.siteDomain,
      exportedAt: input.exportedAt,
      imageCount: downloadedCount,
    }),
  );
  zipEntries['README.txt'] = strToU8(buildPackageReadmeTxt());

  if (input.manifestText) {
    zipEntries['manifest.json'] = strToU8(input.manifestText);
  }

  const fileName = `${slugifyExportBaseName(input.targetKeyword)}.zip`;
  const buffer = Buffer.from(zipSync(zipEntries));

  return { buffer, fileName, imageCount: downloadedCount };
}
