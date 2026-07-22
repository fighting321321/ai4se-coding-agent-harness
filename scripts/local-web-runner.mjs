import { spawn } from "node:child_process";
import console from "node:console";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIGNAL_EXIT_CODES = new Map([
  ["SIGINT", 130],
  ["SIGTERM", 143]
]);

function localApiPort(environment) {
  const candidate = environment.AI4SE_LOCAL_API_PORT ?? "4174";
  if (!/^[0-9]+$/u.test(candidate)) {
    throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
  }

  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
  }
  return port;
}

export function startLocalWeb({
  runtime = process,
  spawnProcess = spawn,
  log = console.log,
  rootDir = root
} = {}) {
  const pnpmCli = runtime.env.npm_execpath;

  if (typeof pnpmCli !== "string" || pnpmCli.length === 0) {
    throw new Error("未找到 pnpm 启动路径，无法启动本地 Web 服务。");
  }

  const apiPort = localApiPort(runtime.env);
  const childEnvironment = {
    ...runtime.env,
    AI4SE_LOCAL_API_PORT: String(apiPort)
  };

  const api = spawnProcess(runtime.execPath, ["apps/api/dist/server-entry.js"], {
    cwd: rootDir,
    stdio: "inherit",
    env: childEnvironment,
    shell: false
  });
  const web = spawnProcess(runtime.execPath, [pnpmCli, "--filter", "@ai4se/web", "dev:local"], {
    cwd: rootDir,
    stdio: "inherit",
    env: childEnvironment,
    shell: false
  });
  const children = [api, web];
  let stopping = false;

  log(`正在启动本地 API：http://127.0.0.1:${apiPort}`);

  function stopChildren(signal, excludedChild) {
    for (const child of children) {
      if (child !== excludedChild && child.exitCode === null && !child.killed) {
        child.kill(signal);
      }
    }
  }

  function fail(failedChild) {
    if (stopping) {
      return;
    }

    stopping = true;
    runtime.exitCode = 1;
    stopChildren("SIGTERM", failedChild);
  }

  for (const child of children) {
    child.once("error", () => fail(child));
    child.once("exit", (code, signal) => {
      if (stopping) {
        return;
      }

      // 任一子进程意外退出时，避免遗留另一个本地服务。
      stopping = true;
      runtime.exitCode = code === 0 && signal === null ? 1 : code ?? 1;
      stopChildren("SIGTERM", child);
    });
  }

  for (const signal of SIGNAL_EXIT_CODES.keys()) {
    runtime.once(signal, () => {
      if (stopping) {
        return;
      }

      // 先固定父进程状态，避免清理产生的子进程事件覆盖信号退出码。
      stopping = true;
      runtime.exitCode = SIGNAL_EXIT_CODES.get(signal);
      stopChildren(signal);
    });
  }
}
