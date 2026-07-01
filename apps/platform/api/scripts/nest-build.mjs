/**
 * nest build 包装：为大项目编译提高 Node 堆上限，避免 test:all 时 Zone OOM。
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nestCli = resolve(apiRoot, 'node_modules/@nestjs/cli/bin/nest.js');
const heapMb = Number(process.env.NEST_BUILD_HEAP_MB ?? 8192);

const result = spawnSync(
  process.execPath,
  [`--max-old-space-size=${heapMb}`, nestCli, 'build'],
  {
    cwd: apiRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

process.exit(result.status ?? 1);
