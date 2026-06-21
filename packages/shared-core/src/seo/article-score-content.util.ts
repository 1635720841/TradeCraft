/**
 * 评分用正文归一化：Semrush / Word 粘贴的 HTML → 可评分的 Markdown 近似文本。
 *
 * 边界：
 * - 不负责：完整 HTML→MD（前端 TipTap + htmlToMarkdown 为主）
 * - 不负责：DB / HTTP
 */

const BLOCK_END_TAGS = /<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi;
const BR_TAG = /<br\s*\/?>/gi;
const TAG_STRIP = /<[^>]+>/g;
const MODULE_HEADING_RE = /^Module\s+(\d+):\s*(.+)$/gim;
const PLAIN_SECTION_HEADINGS = [
  /^Key Takeaways\s*$/gim,
  /^Why\s+Complete\s+Education\s+Matters\s*$/gim,
];

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** 是否像 HTML 片段（Semrush 复制常见） */
export function looksLikeHtmlArticleContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (/<(p|h[1-6]|div|ul|ol|li|table|strong|em|span|br)\b/i.test(trimmed)) {
    return true;
  }
  const tagCount = (trimmed.match(/<[^>]+>/g) ?? []).length;
  return tagCount >= 8 || (trimmed.length > 20_000 && tagCount >= 1);
}

function stripHtmlToPlainText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(BR_TAG, '\n')
    .replace(BLOCK_END_TAGS, '\n\n')
    .replace(TAG_STRIP, '');

  text = decodeBasicEntities(text);
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 连续重复段落（多次 Ctrl+V）只保留一份 */
function collapseDuplicateParagraphs(content: string): string {
  const parts = content.split(/\n\n+/);
  const output: string[] = [];
  let prevKey = '';

  for (const part of parts) {
    const key = part.trim();
    if (!key) continue;
    if (key === prevKey) continue;
    output.push(part.trim());
    prevKey = key;
  }

  return output.join('\n\n');
}

/** 超长正文去重：按 H1 块或段落指纹保留首次出现 */
function dedupeLargeRepeatedBlocks(content: string): string {
  if (content.length < 80_000) return content;

  const byHeading = content.split(/(?=^#\s)/m).map((block) => block.trim()).filter(Boolean);
  if (byHeading.length > 1) {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const block of byHeading) {
      const fingerprint = block.slice(0, 500);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      unique.push(block);
    }
    return unique.join('\n\n');
  }

  const seen = new Set<string>();
  const uniqueParas: string[] = [];
  for (const part of content.split(/\n\n+/)) {
    const key = part.trim();
    if (!key) continue;
    const fingerprint = key.slice(0, 240);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    uniqueParas.push(part.trim());
  }
  return uniqueParas.join('\n\n');
}

/** Semrush 粘贴常见 plain text：Module N / Key Takeaways → Markdown 标题 */
export function normalizeContentHeadingsForScore(content: string): string {
  let text = content.replace(/\r\n/g, '\n').trim();
  if (!text) return text;

  const lines = text.split('\n');
  const first = lines[0]?.trim() ?? '';
  if (first && !first.startsWith('#') && first.length > 0 && first.length <= 140) {
    lines[0] = `# ${first}`;
    text = lines.join('\n');
  }

  text = text.replace(MODULE_HEADING_RE, '## Module $1: $2');
  for (const pattern of PLAIN_SECTION_HEADINGS) {
    text = text.replace(pattern, (match) => `## ${match.trim()}`);
  }

  text = promotePlainTextSectionHeadings(text);

  return text;
}

/** Semrush 纯文本小节标题（无 # 前缀） */
function promotePlainTextSectionHeadings(content: string): string {
  const lines = content.split('\n');
  const output: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    const prev = (lines[i - 1] ?? '').trim();
    const next = (lines[i + 1] ?? '').trim();

    if (
      trimmed &&
      !trimmed.startsWith('#') &&
      trimmed.length >= 10 &&
      trimmed.length <= 90 &&
      !trimmed.endsWith('.') &&
      next &&
      !next.startsWith('#') &&
      (prev === '' || i <= 2)
    ) {
      const isSectionTitle =
        /^(Key Takeaways|How |What |Why |Are |Timeline|Clear Aligners)/i.test(trimmed) ||
        (/^[A-Z]/.test(trimmed) && !/[.!?]$/.test(trimmed) && trimmed.split(/\s+/).length <= 12);
      if (isSectionTitle) {
        output.push(`## ${trimmed}`);
        continue;
      }
    }

    output.push(line);
  }

  return output.join('\n');
}

/** 章节数：Markdown 标题 + Semrush plain「Module N:」 */
export function countSemanticSectionHeadings(content: string): number {
  const normalized = normalizeContentHeadingsForScore(content);
  return (normalized.match(/^#{1,3}\s+.+$/gm) ?? []).length;
}

/** 服务端兜底：HTML / plain text → 可评分 Markdown 近似文本 */
export function normalizeArticleScoreContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;

  let text = looksLikeHtmlArticleContent(trimmed) ? stripHtmlToPlainText(trimmed) : trimmed;

  text = normalizeContentHeadingsForScore(text);
  text = collapseDuplicateParagraphs(text);
  text = dedupeLargeRepeatedBlocks(text);

  return text.trim();
}

/** 解析试算/SWA 目标词输入：逗号、中文逗号、分号、换行分隔 */
export function parseTargetKeywordsInput(raw: string): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const part of raw.split(/[\n,，;；]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }

  return merged;
}

/** 主目标词 + 提交词表（与 Semrush SWA 多 Tag 对齐） */
export function resolveArticleScoreKeywordList(input: {
  targetKeyword: string;
  submittedKeywords?: string[];
}): { primaryKeyword: string; keywordList: string[] } {
  const parsed = parseTargetKeywordsInput(input.targetKeyword);
  const keywordList: string[] = [];
  const seen = new Set<string>();

  for (const item of [...parsed, ...(input.submittedKeywords ?? [])]) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywordList.push(trimmed);
  }

  const primaryKeyword = keywordList[0] ?? input.targetKeyword.trim();
  return { primaryKeyword, keywordList };
}
