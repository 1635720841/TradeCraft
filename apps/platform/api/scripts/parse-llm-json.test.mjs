import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/shared-core/dist/llm/parse-llm-json.js',
);
const { parseLlmJson, extractLlmJsonText } = await import(pathToFileURL(utilPath).href);

const withThinking = `**Crafting JSON**
I need valid JSON only.

{"title":"Test","searchIntent":"informational","outline":[]}`;

assert.equal(parseLlmJson(withThinking).title, 'Test');

const redacted = `<think>planning...</think>
\`\`\`json
{"title":"Brief","outline":[{"heading":"H2","points":["a"]}]}
\`\`\``;
assert.equal(parseLlmJson(redacted).title, 'Brief');

const proseFirst =
  'Here is the brief:\n\n{"title":"X","contentGaps":["gap"],"outline":[],"targetWordCount":1200}';
assert.equal(parseLlmJson(proseFirst).title, 'X');
assert.ok(extractLlmJsonText(proseFirst).startsWith('{'));

console.log('parse-llm-json.test.mjs: ok');
