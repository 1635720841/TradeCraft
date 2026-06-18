/**
 * Semrush 正文 Markdown 结构校验与自动修复（boost/LLM 后兜底）。
 *
 * 修复：`.##` 标题粘连、`word.Word` 句号后缺空格/换行。
 */

export interface SemrushStructureValidation {
  content: string;
  errors: string[];
  fixed: boolean;
}

/** 检测常见结构损坏（不修改已有 `-` Markdown 列表块） */
export function detectSemrushStructureErrors(content: string): string[] {
  const errors: string[] = [];
  if (/\.##/.test(content)) errors.push('heading_glued_after_period');
  if (/[a-z]\.[A-Z]/.test(content)) errors.push('missing_break_after_lowercase_period');
  if (/[.!?]##/.test(content)) errors.push('heading_missing_leading_newline');
  return errors;
}

/** 自动修复结构损坏，保证 `## Heading` 与段落间有空行 */
export function validateAndFixSemrushStructure(content: string): SemrushStructureValidation {
  const errors = detectSemrushStructureErrors(content);
  if (errors.length === 0) {
    return { content, errors: [], fixed: false };
  }

  let result = content;
  result = result.replace(/\.##/g, '.\n\n##');
  result = result.replace(/([.!?])##/g, '$1\n\n##');
  result = result.replace(/([a-z])\.([A-Z][a-z])/g, '$1.\n\n$2');

  return {
    content: result,
    errors,
    fixed: result !== content,
  };
}
