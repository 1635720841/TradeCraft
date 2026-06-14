/**
 * 同时启动 API + Web（Windows / macOS / Linux）。
 * 用法：pnpm dev
 *
 * 若 3000 已有健康 API，则跳过重复启动，避免 EADDRINUSE。
 */
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_HEALTH_URL = "http://localhost:3000/api/v1/health";

async function isApiHealthy() {
  try {
    const res = await fetch(API_HEALTH_URL, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.data?.status === "ok";
  } catch {
    return false;
  }
}

function run(name, script) {
  const child = spawn("pnpm", [script], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[dev] ${name} 退出，code=${code}`);
    }
  });
  return child;
}

const apiAlreadyUp = await isApiHealthy();

if (apiAlreadyUp) {
  console.log("[dev] API 已在 http://localhost:3000 运行，跳过 dev:api（避免 EADDRINUSE）");
} else {
  console.log("[dev] 启动 API (3000)…");
  console.log("[dev] 等待 Nest application successfully started\n");
}

console.log("[dev] 启动 Web (5173)…\n");

const api = apiAlreadyUp ? null : run("api", "dev:api");
const web = run("web", "dev:web");

function shutdown() {
  api?.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
