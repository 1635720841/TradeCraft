/**
 * seoCheckData JSON 安全访问（无 DB 迁移）。
 */

import { PARAPHRASE_PROGRESS_DEFAULT } from './paraphrase-copy';

export interface WorkflowProgressLike {
  phase?: string;
  round?: number;
  maxRounds?: number;
  message?: string;
  localScore?: number;
  semrushScore?: number;
  waitingAhead?: number;
  updatedAt?: string;
}

export interface SemrushRpaInFlightLike {
  startedAt?: string;
  rpaKind?: string;
  round?: number;
  bullJobId?: string;
}

export interface LocalMetricsSamples {
  longParagraphSamples?: Array<{ text: string; wordCount: number }>;
  longSentenceSamples?: Array<{ text: string; wordCount: number }>;
  hardToReadSentenceSamples?: Array<{ text: string; wordCount: number }>;
  casualSentenceSamples?: Array<{ text: string; reason: string }>;
  semrushComplexWordSamples?: Array<{ term: string; suggestion: string }>;
}

export function asSeoCheckRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export function getWorkflowProgress(raw: unknown): WorkflowProgressLike | null {
  const progress = asSeoCheckRecord(raw).workflowProgress;
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return null;
  return progress as WorkflowProgressLike;
}

export function getSemrushRpaInFlight(raw: unknown): SemrushRpaInFlightLike | null {
  const semrush = asSeoCheckRecord(raw).semrush;
  if (!semrush || typeof semrush !== 'object' || Array.isArray(semrush)) return null;
  const inFlight = (semrush as Record<string, unknown>).rpaInFlight;
  if (!inFlight || typeof inFlight !== 'object' || Array.isArray(inFlight)) return null;
  return inFlight as SemrushRpaInFlightLike;
}

export function getLocalMetrics(raw: unknown): LocalMetricsSamples | null {
  const local = asSeoCheckRecord(raw).local;
  if (!local || typeof local !== 'object' || Array.isArray(local)) return null;
  const metrics = (local as Record<string, unknown>).metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  return metrics as LocalMetricsSamples;
}

export function formatSemrushQueueMessage(waitingAhead?: number | null): string {
  if (waitingAhead != null && waitingAhead > 0) {
    return `Semrush 排队中，前面还有 ${waitingAhead} 个任务…`;
  }
  return 'Semrush 排队中，请稍候…';
}

export function enrichWorkflowProgressMessage(
  progress: WorkflowProgressLike | null | undefined,
): string | null {
  if (!progress) return null;
  if (progress.phase === 'semrush-queue') {
    return formatSemrushQueueMessage(progress.waitingAhead);
  }
  if (progress.message) {
    if (progress.round != null && progress.maxRounds != null && !progress.message.includes('/')) {
      return `${progress.message}（${progress.round}/${progress.maxRounds}）`;
    }
    return progress.message;
  }
  if (progress.phase === 'local' && progress.round != null && progress.maxRounds != null) {
    return `本地优化 ${progress.round}/${progress.maxRounds} 轮`;
  }
  if (progress.phase === 'semrush' && progress.round != null && progress.maxRounds != null) {
    return `Semrush 优化 ${progress.round}/${progress.maxRounds} 轮`;
  }
  if (progress.phase === 'semrush-check') return 'Semrush 终检中';
  if (progress.phase === 'paraphrasing') {
    return progress.message ?? PARAPHRASE_PROGRESS_DEFAULT;
  }
  if (progress.phase === 'local-scoring') return '本地预检计分中';
  return null;
}
