/**
 * 从 dist/ 加载 Nest 编译产物（CommonJS），供 node:test 脚本使用。
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(scriptsDir, '..');
const require = createRequire(resolve(scriptsDir, '_cjs_shim.cjs'));

export function loadDist(relativePath) {
  const normalized = relativePath.replace(/^\//, '');
  return require(resolve(apiRoot, 'dist', normalized));
}

export { apiRoot };
