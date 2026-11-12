import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const tempRoot = mkdtempSync(join(tmpdir(), "myagent-e2e-"));
const appCopy = join(tempRoot, "web");
const apiDataDir = join(tempRoot, "api-data");
const excluded = new Set([
  "node_modules",
  ".next",
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  "playwright-report",
  "test-results",
]);

cpSync(appRoot, appCopy, {
  recursive: true,
  filter: (source) => {
    const topLevel = relative(appRoot, source).split("/")[0];
    return !excluded.has(topLevel) && !topLevel.startsWith(".env");
  },
});
symlinkSync(join(appRoot, "node_modules"), join(appCopy, "node_modules"));

const apiChild = spawn(
  join(repoRoot, ".venv", "bin", "python3"),
  [join(appRoot, "scripts", "e2e-api-server.py")],
  {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    MYAGENT_API_HOST: "127.0.0.1",
    MYAGENT_API_PORT: "5001",
    MYAGENT_DATA_DIR: apiDataDir,
    MYAGENT_API_WORKSPACE_ROOT: join(tempRoot, "workspaces"),
    MYAGENT_SIGNUP_ENABLED: "true",
  },
  },
);

let child;
let stopping = false;

async function waitForApi() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (apiChild.exitCode !== null) throw new Error(`API exited with code ${apiChild.exitCode}`);
    try {
      const response = await fetch("http://127.0.0.1:5001/openapi.json");
      if (response.ok) return;
    } catch {
      // The isolated API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the isolated API");
}

await waitForApi();

child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3001"],
  {
    cwd: appCopy,
    stdio: "inherit",
    env: {
      ...process.env,
      MYAGENT_API_URL: "http://127.0.0.1:5001",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);

function cleanup() {
  if (stopping) return;
  stopping = true;
  for (const processGroup of [child, apiChild]) {
    if (!processGroup?.pid) continue;
    try {
      processGroup.kill("SIGTERM");
    } catch {
      // The process may already have exited.
    }
  }
  rmSync(tempRoot, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM", "exit"]) {
  if (signal === "exit") {
    process.on(signal, cleanup);
  } else {
    process.on(signal, () => {
      cleanup();
      process.exit(signal === "SIGINT" ? 130 : 0);
    });
  }
}
child.on("exit", (code, signal) => {
  cleanup();
  process.exitCode = code ?? (signal ? 1 : 0);
  process.exit(process.exitCode);
});
