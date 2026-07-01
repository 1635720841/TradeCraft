/**
 * M7 润色结果归类：区分「无需润色」与「复检失败保留原稿」。
 */

export function isPolishUnneededOutcome(input: {
  contentUnchanged: boolean;
  chunksPolished?: number;
  safetyIssueCount: number;
  validationPassed: boolean;
  regressionReason?: string;
  warnings: string[];
}): boolean {
  if (!input.contentUnchanged) return false;
  if ((input.chunksPolished ?? 0) > 0) return false;
  if (input.safetyIssueCount > 0) return false;
  if (!input.validationPassed) return false;
  if (input.regressionReason) return false;

  const warnings = input.warnings;
  if (warnings.some((line) => line.includes('paraphrase_aborted:'))) return false;
  if (warnings.some((line) => line.includes('内链 URL 丢失') || line.includes('配图 URL 丢失'))) {
    return false;
  }
  if (warnings.some((line) => line.startsWith('Critical issue'))) return false;

  return warnings.some(
    (line) =>
      line.includes('chunk_skipped:') ||
      line.includes('document_skipped:') ||
      line.includes('validate_skipped:minimal_change'),
  );
}

export function isTechnicalParaphraseWarning(line: string): boolean {
  return (
    line.includes('chunk_skipped:') ||
    line.includes('document_skipped:') ||
    line.includes('validate_skipped:') ||
    line.startsWith('format_repaired:') ||
    line === 'readability_repaired_before_save'
  );
}
