/**
 * 流程 RPA 配对排除：纯数据变换（不含租户校验）。
 */

import type { SeoAnalysisSnapshot } from './seo-analysis-snapshot.util';

export function setWorkflowPairCalibrationExcluded(input: {
  seoCheckData: unknown;
  snapshotId: string;
  excluded: boolean;
}): { seoCheckData: Record<string, unknown>; snapshot: SeoAnalysisSnapshot } {
  const data = (input.seoCheckData ?? {}) as {
    analysisSnapshots?: SeoAnalysisSnapshot[];
  };
  const snapshots = Array.isArray(data.analysisSnapshots) ? data.analysisSnapshots : [];
  const index = snapshots.findIndex((snapshot) => snapshot.id === input.snapshotId);
  if (index < 0) {
    throw new Error('SNAPSHOT_NOT_FOUND');
  }

  const current = snapshots[index];
  const nextSnapshot: SeoAnalysisSnapshot = {
    ...current,
    excludedFromCalibration: input.excluded,
  };
  const nextSnapshots = [...snapshots];
  nextSnapshots[index] = nextSnapshot;

  return {
    seoCheckData: {
      ...(data as Record<string, unknown>),
      analysisSnapshots: nextSnapshots,
    },
    snapshot: nextSnapshot,
  };
}

export function findCalibrationSnapshotById(
  seoCheckData: unknown,
  snapshotId: string,
): SeoAnalysisSnapshot | null {
  const data = (seoCheckData ?? {}) as { analysisSnapshots?: SeoAnalysisSnapshot[] };
  const snapshots = Array.isArray(data.analysisSnapshots) ? data.analysisSnapshots : [];
  return snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null;
}

export function isWorkflowCalibrationPairSnapshot(snapshot: SeoAnalysisSnapshot): boolean {
  return (
    snapshot.kind === 'semrush_check' &&
    typeof snapshot.localScore === 'number' &&
    typeof snapshot.semrushOverall === 'number' &&
    snapshot.calibrationProxy !== true &&
    typeof snapshot.calibrationPredicted !== 'number'
  );
}
