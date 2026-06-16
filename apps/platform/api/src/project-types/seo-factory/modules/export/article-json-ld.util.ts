/**
 * Article JSON-LD 生成（M10 导出）。
 *
 * 边界：
 * - 不负责：HTML 正文拼装
 */

export interface ArticleJsonLdInput {
  title: string;
  description?: string;
  content: string;
  siteDomain: string;
  targetKeyword: string;
  publishedAt?: string;
}

export interface FaqJsonLdItem {
  question: string;
  answer: string;
}

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const url = `https://${normalizeDomain(input.siteDomain)}/`;
  const wordCount = input.content.trim().split(/\s+/).filter(Boolean).length;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description ?? input.targetKeyword,
    keywords: input.targetKeyword,
    wordCount,
    datePublished: input.publishedAt ?? new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: normalizeDomain(input.siteDomain),
    },
    publisher: {
      '@type': 'Organization',
      name: normalizeDomain(input.siteDomain),
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function buildFaqPageJsonLd(items: FaqJsonLdItem[]): Record<string, unknown> | null {
  const valid = items
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);

  if (valid.length === 0) return null;

  return {
    '@type': 'FAQPage',
    mainEntity: valid.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function mergeJsonLdGraph(
  ...nodes: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const graph = nodes.filter((node): node is Record<string, unknown> => Boolean(node));
  if (graph.length === 1) {
    return { '@context': 'https://schema.org', ...graph[0] };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export function extractFaqItemsFromBriefAndDraft(
  briefData: unknown,
  draftContent: string,
): FaqJsonLdItem[] {
  const outline = (briefData as { outline?: Record<string, unknown> } | null)?.outline ?? {};
  const briefQuestions = Array.isArray(outline.faqCandidates)
    ? outline.faqCandidates.filter((item): item is string => typeof item === 'string')
    : [];

  const answers = parseFaqAnswersFromMarkdown(draftContent);
  const questions = briefQuestions.length > 0 ? briefQuestions : [...answers.keys()];

  return questions
    .map((question) => {
      const trimmed = question.trim();
      const answer = answers.get(trimmed) ?? answers.get(normalizeFaqKey(trimmed)) ?? '';
      return { question: trimmed, answer };
    })
    .filter((item) => item.question.length > 0 && item.answer.length > 0);
}

function normalizeFaqKey(text: string): string {
  return text.replace(/\?+$/g, '').trim().toLowerCase();
}

function parseFaqAnswersFromMarkdown(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const faqMatch = content.match(/##\s+FAQ\b([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i);
  if (!faqMatch?.[1]) return map;

  const section = faqMatch[1];
  const blocks = section.split(/\n(?=###\s+)/);

  for (const block of blocks) {
    const headingMatch = block.match(/^###\s+(.+?)\s*\n+([\s\S]*)$/);
    if (!headingMatch) continue;

    const question = headingMatch[1].trim();
    const answer = headingMatch[2]
      .replace(/^#+\s+/gm, '')
      .replace(/\n{2,}/g, ' ')
      .trim();

    if (question && answer) {
      map.set(question, answer);
      map.set(normalizeFaqKey(question), answer);
    }
  }

  return map;
}
