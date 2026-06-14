/**
 * 内链匹配与植入纯函数（TF 词重叠 + 业务权重，无外部向量库）。
 *
 * 边界：
 * - 不负责：页面库持久化（SitePageService）
 *
 * 入口：
 * - injectInternalLinks
 */

export interface SitePageCandidate {
  url: string;
  title: string;
  summary?: string | null;
  keywords: string[];
  pageType: string;
  businessValue: number;
}

export interface InternalLinkRecord {
  anchorText: string;
  targetUrl: string;
  pageType: string;
  confidence: number;
  matchReason: string;
  insertAfterHeading?: string;
}

export interface LinkInjectionResult {
  content: string;
  links: InternalLinkRecord[];
}

export interface LinkMatchOptions {
  minConfidence?: number;
  maxLinks?: number;
  wordsPerLink?: number;
  maxSameUrl?: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'can', 'need', 'dare', 'ought', 'used', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
]);

const PAGE_TYPE_WEIGHT: Record<string, number> = {
  PRODUCT: 0.95,
  SERVICE: 0.9,
  SOLUTION: 0.88,
  BLOG: 0.75,
  PAGE: 0.6,
};

const DEFAULT_OPTIONS: Required<LinkMatchOptions> = {
  minConfidence: 0.42,
  maxLinks: 5,
  wordsPerLink: 1000,
  maxSameUrl: 1,
};

interface ContentSection {
  heading: string;
  body: string;
  startIndex: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function inferPageTypeWeight(pageType: string): number {
  return PAGE_TYPE_WEIGHT[pageType.toUpperCase()] ?? PAGE_TYPE_WEIGHT.PAGE;
}

function phraseMatchBoost(sectionText: string, page: SitePageCandidate): number {
  const lower = sectionText.toLowerCase();
  let boost = 0;

  for (const keyword of page.keywords) {
    const trimmed = keyword.trim().toLowerCase();
    if (trimmed.length >= 4 && lower.includes(trimmed)) {
      boost = Math.max(boost, 0.45);
    }
  }

  const titleTokens = tokenize(page.title);
  if (titleTokens.length >= 2) {
    const phrase = titleTokens.slice(0, 2).join(' ');
    if (lower.includes(phrase)) {
      boost = Math.max(boost, 0.35);
    }
  }

  return boost;
}

export function scoreSectionPageMatch(sectionText: string, page: SitePageCandidate): number {
  const sectionTokens = tokenize(sectionText);
  const pageTokens = [
    ...tokenize(page.title),
    ...tokenize(page.summary ?? ''),
    ...page.keywords.flatMap((keyword) => tokenize(keyword)),
  ];

  const semantic = jaccardSimilarity(sectionTokens, pageTokens);
  const keywordOverlap = jaccardSimilarity(sectionTokens, page.keywords.flatMap((k) => tokenize(k)));
  const business = Math.min(1, Math.max(0, page.businessValue));
  const typeBoost = inferPageTypeWeight(page.pageType);

  const base =
    semantic * 0.45 +
    keywordOverlap * 0.25 +
    business * 0.2 +
    typeBoost * 0.1;

  return Math.min(1, base + phraseMatchBoost(sectionText, page));
}

function splitSections(content: string): ContentSection[] {
  const lines = content.split('\n');
  const sections: ContentSection[] = [];
  let currentHeading = '';
  let bodyLines: string[] = [];
  let startIndex = 0;
  let lineOffset = 0;

  const flush = () => {
    const body = bodyLines.join('\n').trim();
    if (body.length > 40 || currentHeading) {
      sections.push({ heading: currentHeading, body, startIndex });
    }
    bodyLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      startIndex = lineOffset;
      lineOffset += line.length + 1;
      continue;
    }
    bodyLines.push(line);
    lineOffset += line.length + 1;
  }
  flush();

  if (sections.length === 0 && content.trim()) {
    sections.push({ heading: '', body: content.trim(), startIndex: 0 });
  }

  return sections;
}

function pickAnchorText(sectionText: string, page: SitePageCandidate): string {
  const title = page.title.trim();
  if (title.length >= 3 && title.length <= 80) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped, 'i').test(sectionText)) {
      return title;
    }
  }

  for (const keyword of page.keywords) {
    const trimmed = keyword.trim();
    if (trimmed.length >= 3 && trimmed.length <= 60 && sectionText.toLowerCase().includes(trimmed.toLowerCase())) {
      return trimmed;
    }
  }

  const words = title.split(/\s+/).filter(Boolean);
  if (words.length > 6) {
    return words.slice(0, 5).join(' ');
  }
  return title || 'Learn more';
}

function paragraphHasLink(paragraph: string): boolean {
  return /\[.+?\]\(.+?\)/.test(paragraph) || /<a\s/i.test(paragraph);
}

function insertLinkIntoSection(section: ContentSection, anchorText: string, url: string): string {
  const link = `[${anchorText}](${url})`;
  const paragraphs = section.body.split(/\n\n+/).filter((p) => p.trim());

  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs[i];
    if (paragraphHasLink(paragraph)) continue;

    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    if (sentences.length === 0) {
      paragraphs[i] = `${paragraph} ${link}.`;
      break;
    }

    const first = sentences[0]?.trim() ?? paragraph;
    sentences[0] = `${first.replace(/[.!?]$/, '')} (${link}).`;
    paragraphs[i] = sentences.join(' ');
    break;
  }

  const headingPrefix = section.heading ? `## ${section.heading}\n\n` : '';
  return `${headingPrefix}${paragraphs.join('\n\n')}`;
}

function rebuildContent(original: string, sections: ContentSection[], updatedBodies: Map<number, string>): string {
  if (sections.length === 1 && !sections[0].heading) {
    return updatedBodies.get(0) ?? original;
  }

  const parts: string[] = [];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const body = updatedBodies.get(i) ?? section.body;
    if (section.heading) {
      parts.push(`## ${section.heading}\n\n${body}`);
    } else {
      parts.push(body);
    }
  }
  return parts.join('\n\n');
}

export function injectInternalLinks(
  content: string,
  pages: SitePageCandidate[],
  options: LinkMatchOptions = {},
): LinkInjectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const trimmed = content.trim();
  if (!trimmed || pages.length === 0) {
    return { content: trimmed, links: [] };
  }

  const wordCount = countWords(trimmed);
  const targetLinks = Math.min(
    opts.maxLinks,
    Math.max(1, Math.floor(wordCount / opts.wordsPerLink)),
  );

  const sections = splitSections(trimmed);
  const urlUseCount = new Map<string, number>();
  const usedSectionIndexes = new Set<number>();
  const links: InternalLinkRecord[] = [];
  const updatedBodies = new Map<number, string>();

  type Candidate = {
    sectionIndex: number;
    page: SitePageCandidate;
    score: number;
  };

  const candidates: Candidate[] = [];
  sections.forEach((section, sectionIndex) => {
    if (paragraphHasLink(section.body)) return;
    for (const page of pages) {
      const score = scoreSectionPageMatch(`${section.heading} ${section.body}`, page);
      if (score >= opts.minConfidence) {
        candidates.push({ sectionIndex, page, score });
      }
    }
  });

  candidates.sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    if (links.length >= targetLinks) break;
    if (usedSectionIndexes.has(candidate.sectionIndex)) continue;

    const used = urlUseCount.get(candidate.page.url) ?? 0;
    if (used >= opts.maxSameUrl) continue;

    const section = sections[candidate.sectionIndex];
    const anchorText = pickAnchorText(section.body, candidate.page);
    const linkedSection = insertLinkIntoSection(section, anchorText, candidate.page.url);
    updatedBodies.set(
      candidate.sectionIndex,
      section.heading ? linkedSection.replace(/^## .+\n\n/, '') : linkedSection,
    );

    links.push({
      anchorText,
      targetUrl: candidate.page.url,
      pageType: candidate.page.pageType,
      confidence: Math.round(candidate.score * 1000) / 1000,
      matchReason: `section "${section.heading || 'intro'}" ↔ ${candidate.page.title}`,
      insertAfterHeading: section.heading || undefined,
    });

    usedSectionIndexes.add(candidate.sectionIndex);
    urlUseCount.set(candidate.page.url, used + 1);
  }

  return {
    content: rebuildContent(trimmed, sections, updatedBodies),
    links,
  };
}

export function inferPageTypeFromUrl(url: string): string {
  const path = url.toLowerCase();
  if (/(^|\/)products?(\/|$)/.test(path)) return 'PRODUCT';
  if (/(^|\/)services?(\/|$)/.test(path)) return 'SERVICE';
  if (/(^|\/)solutions?(\/|$)/.test(path)) return 'SOLUTION';
  if (/(^|\/)blog(\/|$)|(^|\/)articles?(\/|$)|(^|\/)news(\/|$)/.test(path)) return 'BLOG';
  return 'PAGE';
}

export function titleFromUrl(url: string, fallbackKeyword?: string): string {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, '');
    const slug = pathname.split('/').filter(Boolean).pop() ?? '';
    const words = slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
    if (words.length >= 3) return words;
  } catch {
    // ignore invalid URL
  }
  return fallbackKeyword?.trim() || 'Related page';
}
