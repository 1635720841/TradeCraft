/**
 * 出站 HTTP：拉长连接超时 + 瞬断自动重试（PackyAPI / Serper 经代理时常见 10s Connect Timeout）。
 */

import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';

const CONNECT_TIMEOUT_MS = Number(process.env.HTTP_CONNECT_TIMEOUT_MS ?? 60_000);
const FETCH_RETRY_MAX = Number(process.env.HTTP_FETCH_RETRY_MAX ?? 3);
const FETCH_RETRY_DELAY_MS = Number(process.env.HTTP_FETCH_RETRY_DELAY_MS ?? 2_000);

let dispatcherReady = false;

/** 在首屏 fetch 前调用一次（main.ts 已 import） */
export function initHttpDispatcher(): void {
  if (dispatcherReady) return;

  const proxy = process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim();
  const connect = { timeout: CONNECT_TIMEOUT_MS };

  if (proxy) {
    setGlobalDispatcher(
      new ProxyAgent({
        uri: proxy,
        connect,
        proxyTls: { rejectUnauthorized: true },
        requestTls: { rejectUnauthorized: true },
      }),
    );
  } else {
    setGlobalDispatcher(new Agent({ connect }));
  }

  dispatcherReady = true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return false;

  const cause = error.cause instanceof Error ? error.cause.message : '';
  const text = `${error.message} ${cause}`.toLowerCase();

  return (
    error.message === 'fetch failed' ||
    text.includes('connect timeout') ||
    text.includes('econnreset') ||
    text.includes('econnrefused') ||
    text.includes('etimedout') ||
    text.includes('socket hang up') ||
    text.includes('network') ||
    text.includes('proxy')
  );
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: { maxRetries?: number; label?: string },
): Promise<Response> {
  initHttpDispatcher();

  const maxRetries = Math.max(1, options?.maxRetries ?? FETCH_RETRY_MAX);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt >= maxRetries) {
        throw error;
      }
      await sleep(FETCH_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

export function buildProxyHint(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const cause =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const combined = `${message} ${cause}`;
  if (
    combined.includes('Connect Timeout') ||
    message === 'fetch failed' ||
    combined.toLowerCase().includes('econnrefused')
  ) {
    return '；请确认 Clash 已开启、HTTPS_PROXY 正确（如 http://127.0.0.1:7890），或稍后重试';
  }
  return '';
}
