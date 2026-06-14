/**
 * 从 Brief 数据提取 optimize 阶段所需的结构上下文。
 *
 * 边界：
 * - 不负责：LLM 调用（由 LlmService / OpenAiCompatibleAdapter 处理）
 *
 * 入口：
 * - buildOptimizeBriefContext
 */

export interface OptimizeBriefContext {
  briefSummary: string;
  targetWordCount: number;
  searchIntent: string;
}

const DEFAULT_TARGET_WORD_COUNT = 1500;
const DEFAULT_SEARCH_INTENT = 'informational';

/** 从 job.briefData 提取 optimize Prompt 所需的 Brief 摘要与约束字段 */
export function buildOptimizeBriefContext(briefData: unknown): OptimizeBriefContext {
  const root = (briefData as { outline?: Record<string, unknown> } | null)?.outline ?? {};

  const targetWordCount =
    typeof root.targetWordCount === 'number' && root.targetWordCount > 0
      ? root.targetWordCount
      : DEFAULT_TARGET_WORD_COUNT;

  const searchIntent =
    typeof root.searchIntent === 'string' && root.searchIntent.trim().length > 0
      ? root.searchIntent.trim()
      : DEFAULT_SEARCH_INTENT;

  const summary: Record<string, unknown> = {};
  if (Array.isArray(root.outline) && root.outline.length > 0) {
    summary.outline = root.outline;
  }
  if (Array.isArray(root.contentGaps) && root.contentGaps.length > 0) {
    summary.contentGaps = root.contentGaps;
  }
  if (Array.isArray(root.writingGuidelines) && root.writingGuidelines.length > 0) {
    summary.writingGuidelines = root.writingGuidelines;
  }

  const briefSummary =
    Object.keys(summary).length > 0
      ? JSON.stringify(summary, null, 2)
      : '（无 Brief 摘要，按当前正文结构与主题保留核心信息）';

  return { briefSummary, targetWordCount, searchIntent };
}
