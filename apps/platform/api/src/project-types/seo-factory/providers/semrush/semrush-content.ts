/** Markdown → Semrush Quill 编辑器可用 HTML */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

const INLINE_MARKDOWN_RE =
  /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;

/** 行内 Markdown：图片、链接、粗体、斜体、代码 */
function inlineMarkdownToHtml(text: string): string {
  let html = '';
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_MARKDOWN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      html += escapeHtml(text.slice(lastIndex, index));
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      html += `<img alt="${escapeHtml(match[1])}" src="${escapeHtmlAttr(match[2])}">`;
    } else if (match[3] !== undefined && match[4] !== undefined) {
      html += `<a href="${escapeHtmlAttr(match[4])}">${escapeHtml(match[3])}</a>`;
    } else if (match[5] !== undefined) {
      html += `<strong>${escapeHtml(match[5])}</strong>`;
    } else if (match[6] !== undefined) {
      html += `<em>${escapeHtml(match[6])}</em>`;
    } else if (match[7] !== undefined) {
      html += `<code>${escapeHtml(match[7])}</code>`;
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    html += escapeHtml(text.slice(lastIndex));
  }

  return html;
}

/** Markdown 转纯文本（兜底） */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^-\s+/gm, '• ')
    .trim();
}

/** Markdown 转 HTML，保留标题、段落、列表等结构 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${inlineMarkdownToHtml(ordered[1])}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
  }

  closeLists();
  return html.join('') || '<p><br></p>';
}
