import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(scriptsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(scriptsDir, name));

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: join(scriptsDir, "..")
});

process.exit(result.status ?? 1);
