/**
 * Semrush RPA 冒烟测试：验证 3ue 登录 → SWA 查分链路。
 * 用法：cd apps/platform/api && node scripts/semrush-rpa-smoke.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

process.env.SEMRUSH_ENABLED = 'true';

const { SemrushRpaAdapter } = await import('../dist/project-types/seo-factory/providers/semrush/semrush-rpa.adapter.js');
const { SemrushSessionManager } = await import('../dist/project-types/seo-factory/providers/semrush/semrush-session.manager.js');

class ConsoleLogger {
  info(msg, meta) {
    console.log('[info]', msg, meta ?? '');
  }
  error(msg, meta) {
    console.error('[error]', msg, meta ?? '');
  }
  warn() {}
}

const logger = new ConsoleLogger();
const sessionManager = new SemrushSessionManager(logger);
const adapter = new SemrushRpaAdapter(sessionManager, logger);

const sample = `## What is AI?

Artificial intelligence helps businesses automate decisions and improve efficiency with machine learning and data analytics.`;

const result = await adapter.checkScore({
  keyword: 'artificial intelligence',
  content: sample,
});

console.log('\n=== Semrush RPA Result ===');
console.log(JSON.stringify(result, null, 2));
