import type { Locator, Page } from 'playwright';
import { SEMRUSH_UI_POLL_MS } from './semrush.constants';
import { assertSemrushNotAbortedInContext, semrushAbortContext } from './semrush-work-abort.context';

export async function pollUntil(
  check: () => Promise<boolean>,
  options: { timeoutMs: number; intervalMs?: number; label: string },
): Promise<void> {
  const intervalMs = options.intervalMs ?? SEMRUSH_UI_POLL_MS;
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    await assertSemrushNotAbortedInContext();
    if (await check()) return;
    await sleep(intervalMs);
  }

  throw new Error(`等待超时：${options.label}（${options.timeoutMs / 1000}s）`);
}

export async function waitForAnyLocator(
  page: Page,
  buildLocator: (page: Page) => Locator,
  options: { timeoutMs: number; intervalMs?: number; label: string },
): Promise<Locator> {
  const intervalMs = options.intervalMs ?? SEMRUSH_UI_POLL_MS;
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    await assertSemrushNotAbortedInContext();
    try {
      const locator = buildLocator(page).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(intervalMs);
  }

  const detail = lastError instanceof Error ? `（${lastError.message}）` : '';
  throw new Error(`等待超时：${options.label}${detail}`);
}

const ABORT_SLEEP_SLICE_MS = 400;

export async function sleep(ms: number): Promise<void> {
  if (!semrushAbortContext.getStore()) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }

  let remaining = ms;
  while (remaining > 0) {
    await assertSemrushNotAbortedInContext();
    const slice = Math.min(ABORT_SLEEP_SLICE_MS, remaining);
    await new Promise((resolve) => setTimeout(resolve, slice));
    remaining -= slice;
  }
}
