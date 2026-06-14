/**
 * 完整 RPA 分析后输出侧栏 debug（需 SEMRUSH_DEBUG_SIDEBAR=1）。
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });
process.env.SEMRUSH_ENABLED = 'true';
process.env.SEMRUSH_DEBUG_SIDEBAR = '1';

const { SemrushRpaAdapter } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-rpa.adapter.js'
);
const { SemrushSessionManager } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-session.manager.js'
);

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
const adapter = new SemrushRpaAdapter(new SemrushSessionManager(logger), logger);

const sample = `## What is Artificial Intelligence?

Artificial intelligence (AI) is a branch of computer science focused on building systems that can perform tasks typically requiring human intelligence. These tasks include learning from data, recognizing patterns, making decisions, and understanding natural language.

### How AI Works

AI systems rely on machine learning models trained on large amounts of data. Neural networks and deep learning architectures process information through multiple layers, similar in concept to how the human brain processes signals.

### Applications

Businesses use artificial intelligence for automation, decision support, customer service, and content generation. Large language models (LLMs) power many modern AI applications including chatbots and writing assistants.

### Challenges

AI governance, bias in data sets, and computing power requirements remain important considerations for organizations adopting AI technology.`;

const result = await adapter.checkScore({
  keyword: 'what is artificial intelligence',
  content: sample,
});

console.log('\n=== Result ===');
console.log(JSON.stringify(result, null, 2));
