/**
 * Semrush RPA 冒烟测试：验证 3ue 登录 → SWA 查分链路。
 * 用法：cd apps/platform/api && pnpm run semrush:smoke
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

process.env.SEMRUSH_ENABLED = 'true';
process.env.SEMRUSH_HEADLESS = process.env.SEMRUSH_HEADLESS ?? 'false';

const { SemrushRpaAdapter } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-rpa.adapter.js',
);
const { SemrushSessionManager } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-session.manager.js',
);
const { SemrushBrowserPool } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-browser-pool.js',
);

class ConsoleLogger {
  info(msg, meta) {
    console.log('[info]', msg, meta ?? '');
  }
  error(msg, meta) {
    console.error('[error]', msg, meta ?? '');
  }
  warn(msg, meta) {
    console.warn('[warn]', msg, meta ?? '');
  }
}

const logger = new ConsoleLogger();
const browserPool = new SemrushBrowserPool(logger);
const sessionManager = new SemrushSessionManager(logger, browserPool);
const noopAbortService = {
  shouldAbort: () => false,
  register: () => {},
  unregister: () => {},
};
const adapter = new SemrushRpaAdapter(sessionManager, noopAbortService, logger);

const sample = `## What is AI?

Artificial intelligence helps businesses automate decisions and improve efficiency with machine learning and data analytics.`;

try {
  const result = await adapter.checkScore({
    keyword: 'artificial intelligence',
    content: sample,
  });

  console.log('\n=== Semrush RPA Result ===');
  console.log(JSON.stringify(result, null, 2));

  if (result.skipped) {
    console.error('\n[smoke] Semrush 返回 skipped，请检查 SEMRUSH_ENABLED 与账号配置');
    process.exit(1);
  }
  if (typeof result.overall !== 'number' || result.overall <= 0) {
    console.error('\n[smoke] 未获得有效 overall 分数');
    process.exit(1);
  }
  console.log('\n[smoke] OK');
} catch (error) {
  console.error('[smoke] failed', error);
  process.exit(1);
}
