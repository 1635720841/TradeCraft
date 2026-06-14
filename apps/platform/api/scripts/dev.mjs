/**
 * 开发启动脚本：在启动 Nest 前加载 .env，并启用 Node 代理支持。
 * 解决国内环境 Node fetch 不走系统代理导致 Serper/DeepSeek 超时的问题。
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

// 出站代理与连接超时由 src/core/http/http-fetch.ts（main.ts 启动时 initHttpDispatcher）统一处理

const child = spawn('nest', ['start', '--watch'], {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
