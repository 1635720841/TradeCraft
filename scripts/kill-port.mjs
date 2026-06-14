/**
 * 释放指定端口（Windows PowerShell / 跨平台 fallback）。
 * 用法：node scripts/kill-port.mjs 3000
 */
import { execSync } from "node:child_process";

const port = process.argv[2];
if (!port) {
  console.error("用法: node scripts/kill-port.mjs <port>");
  process.exit(1);
}

const isWin = process.platform === "win32";

try {
  if (isWin) {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
      { encoding: "utf8" }
    ).trim();
    const pids = [...new Set(out.split(/\s+/).filter(Boolean))];
    if (pids.length === 0) {
      console.log(`端口 ${port} 无监听进程`);
      process.exit(0);
    }
    for (const pid of pids) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "inherit" });
      console.log(`已结束 PID ${pid}（端口 ${port}）`);
    }
  } else {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: "inherit", shell: true });
  }
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
}
