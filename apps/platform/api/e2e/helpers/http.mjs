/**
 * E2E HTTP 客户端：登录与带 Bearer 的 API 调用。
 */

import { E2E_API_BASE_URL } from './config.mjs';

export class E2eHttpError extends Error {
  constructor(status, body, url, method) {
    const message =
      body?.error?.message ??
      body?.message ??
      `HTTP ${status} ${method} ${url}`;
    super(message);
    this.name = 'E2eHttpError';
    this.status = status;
    this.body = body;
    this.url = url;
    this.method = method;
  }
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function isApiReachable(baseUrl = E2E_API_BASE_URL) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function login(email, password, baseUrl = E2E_API_BASE_URL) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password }),
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new E2eHttpError(response.status, body, '/api/v1/auth/login', 'POST');
  }

  const accessToken = body?.data?.accessToken;
  if (!accessToken) {
    throw new Error('登录响应缺少 accessToken');
  }

  return { accessToken, session: body.data };
}

export async function apiRequest(method, path, { token, body, baseUrl = E2E_API_BASE_URL } = {}) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const headers = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new E2eHttpError(response.status, payload, path, method);
  }

  return { status: response.status, data: payload?.data, meta: payload?.meta, raw: payload };
}

export async function apiBinaryRequest(method, path, { token, body, baseUrl = E2E_API_BASE_URL } = {}) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const headers = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    let payload = null;
    try {
      payload = JSON.parse(buffer.toString('utf8'));
    } catch {
      payload = { raw: buffer.toString('utf8').slice(0, 500) };
    }
    throw new E2eHttpError(response.status, payload, path, method);
  }

  return {
    status: response.status,
    buffer,
    headers: response.headers,
  };
}

export async function apiMultipartRequest(method, path, { token, formData, baseUrl = E2E_API_BASE_URL } = {}) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const headers = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: formData,
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new E2eHttpError(response.status, payload, path, method);
  }

  return { status: response.status, data: payload?.data, meta: payload?.meta, raw: payload };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pollUntil(getter, predicate, { intervalMs, timeoutMs, label }) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const value = await getter();
    if (predicate(value)) {
      return value;
    }
    await sleep(intervalMs);
  }

  throw new Error(`${label ?? 'poll'} 超时（${timeoutMs}ms）`);
}
