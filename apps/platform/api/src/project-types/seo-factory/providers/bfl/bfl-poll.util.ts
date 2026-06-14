/**
 * BFL 官方 API 响应解析（异步轮询纯函数，便于单测）。
 */

export interface BflCreateResponse {
  id?: string;
  polling_url?: string;
}

export interface BflPollResponse {
  status?: string;
  result?: { sample?: string };
}

const TERMINAL_FAILURE_STATUSES = new Set([
  'Error',
  'Failed',
  'Request Moderated',
  'Content Moderated',
]);

export function extractPollingUrl(body: BflCreateResponse): string | undefined {
  const url = body.polling_url?.trim();
  return url || undefined;
}

export function extractReadyImageUrl(body: BflPollResponse): string | undefined {
  if (body.status !== 'Ready') return undefined;
  const url = body.result?.sample?.trim();
  return url || undefined;
}

export function isTerminalFailureStatus(status: string | undefined): boolean {
  if (!status) return false;
  return TERMINAL_FAILURE_STATUSES.has(status);
}
