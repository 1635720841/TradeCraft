/**
 * SEO 发布就绪判定（本地 + Semrush 双门控）。
 */

export const DEFAULT_LOCAL_SEO_PASS_THRESHOLD = 95;
export const DEFAULT_SEMRUSH_PASS_THRESHOLD = 9.0;

export interface ReleaseThresholds {
  localPassThreshold: number;
  semrushPassThreshold: number;
}

export interface ReleaseReadinessInput {
  localScore: number | null;
  semrushScore: number | null;
  localPassThreshold?: number;
  semrushPassThreshold?: number;
}

export interface ReleaseReadinessResult {
  localPassed: boolean;
  semrushPassed: boolean;
  releaseReady: boolean;
  gatesPassed: number;
  gatesTotal: number;
  gapText: string | null;
}

export function resolveReleaseThresholds(
  input?: Partial<ReleaseThresholds>,
): ReleaseThresholds {
  return {
    localPassThreshold:
      input?.localPassThreshold ?? DEFAULT_LOCAL_SEO_PASS_THRESHOLD,
    semrushPassThreshold:
      input?.semrushPassThreshold ?? DEFAULT_SEMRUSH_PASS_THRESHOLD,
  };
}

export function evaluateLocalPassed(
  localScore: number | null,
  threshold: number,
): boolean {
  return localScore != null && localScore >= threshold;
}

export function evaluateSemrushPassed(
  semrushScore: number | null,
  threshold: number,
): boolean {
  return semrushScore != null && semrushScore >= threshold;
}

export function isSeoReleaseReady(
  localPassed: boolean,
  semrushPassed: boolean,
): boolean {
  return localPassed && semrushPassed;
}

export function evaluateReleaseReadiness(
  input: ReleaseReadinessInput,
): ReleaseReadinessResult {
  const thresholds = resolveReleaseThresholds({
    localPassThreshold: input.localPassThreshold,
    semrushPassThreshold: input.semrushPassThreshold,
  });
  const localPassed = evaluateLocalPassed(
    input.localScore,
    thresholds.localPassThreshold,
  );
  const semrushPassed = evaluateSemrushPassed(
    input.semrushScore,
    thresholds.semrushPassThreshold,
  );
  const releaseReady = isSeoReleaseReady(localPassed, semrushPassed);
  const gatesPassed = (localPassed ? 1 : 0) + (semrushPassed ? 1 : 0);

  let gapText: string | null = null;
  if (!releaseReady) {
    const parts: string[] = [];
    if (!localPassed && input.localScore != null) {
      const delta = Math.max(
        0,
        Math.ceil(thresholds.localPassThreshold - input.localScore),
      );
      parts.push(
        delta > 0
          ? `本地还差 ${delta} 分`
          : `本地未达 ${thresholds.localPassThreshold}`,
      );
    } else if (!localPassed) {
      parts.push('本地待评分');
    }
    if (!semrushPassed && input.semrushScore != null) {
      const delta = Math.max(
        0,
        Math.round((thresholds.semrushPassThreshold - input.semrushScore) * 10) /
          10,
      );
      parts.push(
        delta > 0
          ? `Semrush 还差 ${delta}`
          : `Semrush 未达 ${thresholds.semrushPassThreshold}`,
      );
    } else if (!semrushPassed) {
      parts.push('Semrush 待评分');
    }
    gapText = parts.length ? parts.join(' · ') : null;
  }

  return {
    localPassed,
    semrushPassed,
    releaseReady,
    gatesPassed,
    gatesTotal: 2,
    gapText,
  };
}

export function buildReleaseReadinessLabel(
  result: Pick<ReleaseReadinessResult, 'releaseReady' | 'gatesPassed' | 'gatesTotal'>,
): string {
  if (result.releaseReady) return `发布就绪 ${result.gatesPassed}/${result.gatesTotal}`;
  return `发布就绪 ${result.gatesPassed}/${result.gatesTotal}`;
}
