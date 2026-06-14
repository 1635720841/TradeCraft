/**
 * 记录分析期间全部 /swa/api/ 请求路径。
 */
import { config } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });
process.env.SEMRUSH_ENABLED = 'true';

const OUT = join(apiRoot, '.semrush-session', 'probe');
const urls = new Set();
const payloads = [];

const { SemrushRpaAdapter } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-rpa.adapter.js'
);
const { SemrushSessionManager } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-session.manager.js'
);

class ConsoleLogger {
  info(m, x) {
    console.log('[info]', m, x ?? '');
  }
  error(m, x) {
    console.error('[error]', m, x ?? '');
  }
  warn() {}
}

const logger = new ConsoleLogger();
const sessionManager = new SemrushSessionManager(logger);

await sessionManager.withBrowser(async (context) => {
  const session = await sessionManager.openSemrushEditor(context);
  const { page } = session;

  page.on('response', async (response) => {
    const url = response.url();
    if (!/\/swa\/api\//i.test(url)) return;
    urls.add(url.replace(/\?.*$/, '').replace(/smr-[0-9a-f-]+/gi, 'smr-{id}'));
    const ct = response.headers()['content-type'] ?? '';
    if (!ct.includes('json')) return;
    try {
      const body = await response.json();
      payloads.push({
        url,
        keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 40) : [],
        sample: JSON.stringify(body).slice(0, 400),
      });
    } catch {
      /* ignore */
    }
  });

  const adapter = new SemrushRpaAdapter(sessionManager, logger);
  const result = await adapter.checkScore({
    keyword: 'what is artificial intelligence',
    content: `## What is AI?\n\nArtificial intelligence uses machine learning and neural networks.`,
  });

  const bodySample = await page
    .locator('body')
    .innerText()
    .then((t) => t.replace(/\s+/g, ' ').slice(0, 4000))
    .catch(() => '');

  await mkdir(OUT, { recursive: true });
  await writeFile(
    join(OUT, 'network-probe.json'),
    JSON.stringify({ result, urls: [...urls], payloads, bodySample }, null, 2),
  );
  console.log('urls:', [...urls]);
  console.log('suggestionCount:', result.suggestions?.length);
  console.log('body has 可读性:', bodySample.includes('可读性'));
  console.log('body has 过于复杂:', bodySample.includes('过于复杂'));

  await page.close().catch(() => undefined);
});
