/**
 * M7 运营向文案：表达润色（轻量优化模板化句式，保持 SEO 结构）。
 */

export const PARAPHRASE_FEATURE_NAME = '表达润色';

export const PARAPHRASE_FEATURE_SHORT = '表达润色';

export const PARAPHRASE_FEATURE_HINT =
  'Semrush 优化后轻量优化模板化句式，保持关键词、术语与段落结构。';

export const PARAPHRASE_WORKFLOW_STEP_LABEL = PARAPHRASE_FEATURE_NAME;

export const PARAPHRASE_PROGRESS_DEFAULT = '表达润色中';

export const PARAPHRASE_PROGRESS_RUNNING = '正在表达润色…';

export const PARAPHRASE_PROGRESS_VALIDATING = '表达润色复检中…';

export function formatParaphraseChunkProgress(current: number, total: number): string {
  return `表达润色中（${current}/${total}）…`;
}

export const PARAPHRASE_SITE_DISABLED = '站点已关闭表达润色';

export const PARAPHRASE_EMPTY_DRAFT_ERROR = '初稿为空，无法执行表达润色';

export const PARAPHRASE_SKIPPED_DEFAULT = '已跳过表达润色';

export const PARAPHRASE_RERUN_QUEUED = '已重新入队表达润色，请稍候…';

export const PARAPHRASE_RERUN_FAILED = '重新处理失败';

export const PARAPHRASE_BTN_RERUN = '重新润色';

export const PARAPHRASE_STATUS_PENDING = '待处理';

export const PARAPHRASE_STATUS_SKIPPED = '已跳过';

export const PARAPHRASE_STATUS_UNNEEDED = '无需润色';

export const PARAPHRASE_STATUS_KEPT_ORIGINAL = '已保留原稿';

export const PARAPHRASE_STATUS_DONE = '已完成';

export const PARAPHRASE_STATUS_INCOMPLETE = '未完成';

export const PARAPHRASE_BADGE_CHECKED = '表达已检查';

export const PARAPHRASE_BADGE_POLISHED = '表达已润色';

export const PARAPHRASE_SUMMARY_DONE = '表达润色已完成，结构与 SEO 目标保持不变。';

export const PARAPHRASE_SUMMARY_UNNEEDED =
  '未发现需优化的模板句式，正文保持 Semrush 优化稿不变。';

export function formatParaphraseSummaryUnneededChunks(chunkCount: number): string {
  return `已检查 ${chunkCount} 个段落，未发现需优化的模板句式，正文保持 Semrush 优化稿不变。`;
}

export const PARAPHRASE_COMPARE_BEFORE = '润色前（Semrush 优化稿）';

export const PARAPHRASE_COMPARE_AFTER = '润色后（当前正文）';

export const PARAPHRASE_COMPARE_COLLAPSE = '查看润色前后对比';
