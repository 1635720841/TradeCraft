/**
 * 优化轮次历史与单轮聚焦维度，供 LLM Prompt 回灌以稳定提分。
 *
 * 边界：
 * - 不负责：LLM 调用、评分计算
 *
 * 入口：
 * - formatFocusDimensions
 * - formatOptimizeHistoryContext
 */

import type { DraftOptimizeRound, OptimizeRoundBreakdown } from './llm.service';

const DIMENSION_MAX: Record<keyof OptimizeRoundBreakdown, number> = {
  keywordCoverage: 25,
  serpTermAlignment: 25,
  structure: 20,
  readability: 20,
  contentDepth: 10,
};

const DIMENSION_LABELS: Record<keyof OptimizeRoundBreakdown, string> = {
  keywordCoverage: 'Keyword coverage',
  serpTermAlignment: 'SERP entities',
  structure: 'Structure',
  readability: 'Readability',
  contentDepth: 'Content depth',
};

/** 选出缺口最大的 1–2 个维度，供单轮聚焦修补 */
export function formatFocusDimensions(breakdown: OptimizeRoundBreakdown): string {
  const gaps = (Object.keys(DIMENSION_MAX) as Array<keyof OptimizeRoundBreakdown>)
    .map((key) => ({
      label: DIMENSION_LABELS[key],
      score: breakdown[key],
      max: DIMENSION_MAX[key],
      gap: DIMENSION_MAX[key] - breakdown[key],
    }))
    .filter((d) => d.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  if (gaps.length === 0) {
    return 'All dimensions at max — make minimal polish edits only; do not rewrite unrelated sections.';
  }

  const focus = gaps.slice(0, 2);
  const lines = [
    `**This round: fix ONLY these ${focus.length} dimension(s). Do not rewrite unrelated sections.**`,
    ...focus.map((d) => `- ${d.label}: ${d.score}/${d.max} (${d.gap} pts below max)`),
  ];

  const stable = gaps.slice(2, 4);
  if (stable.length > 0) {
    lines.push('', 'Leave these stable unless a hard requirement needs a tiny fix:');
    for (const d of stable) {
      lines.push(`- ${d.label}: ${d.score}/${d.max}`);
    }
  }

  return lines.join('\n');
}

/** 格式化同阶段历史轮次，供 Prompt 避免重复失败改法 */
export function formatOptimizeHistoryContext(
  history: DraftOptimizeRound[] | undefined,
  phase: 'local' | 'semrush',
): string {
  if (!history?.length) {
    return '(First optimization round — no prior history.)';
  }

  const rounds = history.filter(
    (h) => h.phase === phase && h.kind === 'optimize' && h.scoreBefore != null,
  );
  if (rounds.length === 0) {
    return '(First optimization round in this phase — no prior history.)';
  }

  const lines = [
    'Past rounds in this phase (do NOT repeat edits that lowered score):',
    ...rounds.map((r) => {
      const before = r.scoreBefore!;
      const after = r.scoreAfter ?? '?';
      const delta =
        typeof r.scoreAfter === 'number' ? r.scoreAfter - before : null;
      const deltaStr =
        delta != null ? (delta >= 0 ? `(+${delta})` : `(${delta})`) : '';
      const rollback = r.rolledBack ? ' [REVERTED — edits discarded]' : '';
      const candidate =
        r.rolledBack && typeof r.candidateScoreAfter === 'number'
          ? ` Candidate: ${r.candidateScoreAfter}${phase === 'local' ? '/100' : '/10'}`
          : '';
      const candidateLocal =
        r.rolledBack &&
        phase === 'semrush' &&
        typeof r.candidateLocalScoreAfter === 'number'
          ? ` (local candidate ${r.candidateLocalScoreAfter}/100)`
          : '';
      const changes = r.changesSummary?.length
        ? ` Changes: ${r.changesSummary.join('; ')}`
        : '';
      const warn = r.warnings?.length ? ` Warnings: ${r.warnings.join('; ')}` : '';
      const local =
        phase === 'semrush' && r.localScoreAfter != null
          ? ` Local after: ${r.localScoreAfter}/100`
          : '';
      return `- Round ${r.round}: ${before} → ${after} ${deltaStr}${rollback}${candidate}${candidateLocal}${local}${changes}${warn}`;
    }),
  ];

  const failed = rounds.filter(
    (r) =>
      r.rolledBack ||
      (typeof r.scoreAfter === 'number' && r.scoreAfter < (r.scoreBefore ?? 0)),
  );
  if (failed.length > 0) {
    lines.push('', 'Failed approaches to avoid:');
    for (const r of failed) {
      if (r.changesSummary?.length) {
        lines.push(
          `- Round ${r.round} dropped score — do not repeat: ${r.changesSummary.join('; ')}`,
        );
      }
    }
  }

  return lines.join('\n');
}
