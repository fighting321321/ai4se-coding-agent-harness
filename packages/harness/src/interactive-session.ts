import { join, resolve } from "node:path";

import type { ApprovalHandler } from "./approval.js";
import { CredentialStore, type CredentialStoreFactory } from "./credential-store.js";
import type { SystemCredentialVaultFactory } from "./first-run.js";
import { WindowsUserCredentialVault } from "./system-credential-vault.js";
import {
  readHarnessTaskConfig,
  runHarnessTask,
  updateHarnessModel,
  type RunHarnessTaskOptions,
  type RunTaskResult
} from "./run-task.js";
import { validModelName } from "./config.js";
import { Redactor } from "./redactor.js";
import { SessionContext } from "./session-context.js";
import type { TraceEntry } from "./trace.js";

export interface InteractiveSessionOptions {
  readonly cwd: string;
  readonly configPath: string;
  readonly credentialMode?: "legacy" | "system";
}

export interface InteractiveSessionDependencies {
  readonly readSecret: (prompt: string) => Promise<string>;
  readonly credentialStoreFactory?: CredentialStoreFactory;
  readonly systemCredentialVaultFactory?: SystemCredentialVaultFactory;
  readonly readLine: (prompt: string) => Promise<string | undefined>;
  readonly askApproval?: ApprovalHandler;
  readonly runTask?: (options: RunHarnessTaskOptions) => Promise<RunTaskResult>;
  readonly clearScreen?: () => void;
  readonly writeOut: (message: string) => void;
  readonly writeError: (message: string) => void;
}

const HELP = [
  "可用命令：",
  "  /help   显示帮助",
  "  /new    开始新对话",
  "  /model  查看或切换模型",
  "  /status 显示当前工作区和模型",
  "  /trace  显示上一项任务的 Trace",
  "  /clear  清屏",
  "  /exit   退出会话"
].join("\n");

function actionLabel(entry: TraceEntry): string {
  const action = entry.action;
  if (action === undefined) {
    return "system";
  }
  if (action.type === "read_file" || action.type === "write_file") {
    return `${action.type} ${action.path}`;
  }
  if (action.type === "run_command") {
    return `run_command ${action.executable}`;
  }
  return "finish";
}

function formatTrace(entries: readonly TraceEntry[]): string {
  if (entries.length === 0) {
    return "尚无本次会话 Trace";
  }
  return entries
    .map((entry) =>
      `[${entry.step}] ${actionLabel(entry)} · ${entry.policy} · ${entry.status}`
    )
    .join("\n");
}

export async function runInteractiveSession(
  options: InteractiveSessionOptions,
  dependencies: InteractiveSessionDependencies
): Promise<number> {
  const configured = await readHarnessTaskConfig(options.configPath);
  if (!configured.ok) {
    dependencies.writeError(`配置读取失败：${configured.error.code}`);
    return 1;
  }

  const workspace = resolve(options.cwd);
  try {
    const credential = options.credentialMode === "system"
      ? await readSystemCredential(options.cwd, dependencies)
      : await readLegacyCredential(options.cwd, dependencies);
    if (!credential.ok) {
      dependencies.writeError(`凭据读取失败：${credential.code}`);
      return 1;
    }
    const apiKey = credential.value;
    const session = new SessionContext({ redactor: new Redactor([apiKey]) });
    let currentModel = configured.value.provider.model;

    dependencies.writeOut("AI4SE Coding Agent");
    dependencies.writeOut(`工作区：${workspace}`);
    dependencies.writeOut(`模型：${currentModel}`);
    dependencies.writeOut("输入 /help 查看命令。");

    let latestTrace: readonly TraceEntry[] = [];
    while (true) {
      dependencies.writeOut("ai4se>");
      const input = await dependencies.readLine("");
      if (input === undefined || input.trim() === "/exit") {
        dependencies.writeOut("会话已结束");
        return 0;
      }

      const task = input.trim();
      if (task.length === 0) {
        continue;
      }
      if (task === "/help") {
        dependencies.writeOut(HELP);
        continue;
      }
      if (task === "/new") {
        session.reset();
        latestTrace = [];
        dependencies.writeOut("已开始新对话");
        continue;
      }
      if (task === "/model") {
        dependencies.writeOut(`当前模型：${currentModel}`);
        continue;
      }
      if (task.startsWith("/model ")) {
        const model = task.slice("/model ".length);
        if (!validModelName(model)) {
          dependencies.writeError("模型名称无效");
          continue;
        }
        const saved = await updateHarnessModel(options.configPath, model);
        if (!saved.ok) {
          dependencies.writeError("模型保存失败");
          continue;
        }
        currentModel = model;
        dependencies.writeOut(`模型已切换：${currentModel}`);
        continue;
      }
      if (task === "/status") {
        dependencies.writeOut(`工作区：${workspace}\n模型：${currentModel}`);
        continue;
      }
      if (task === "/trace") {
        dependencies.writeOut(formatTrace(latestTrace));
        continue;
      }
      if (task === "/clear") {
        dependencies.clearScreen?.();
        continue;
      }
      if (task.startsWith("/")) {
        dependencies.writeError(`未知命令：${task}`);
        continue;
      }

      const result = await (dependencies.runTask ?? runHarnessTask)({
        cwd: options.cwd,
        configPath: options.configPath,
        task,
        provider: { apiKey, model: currentModel },
        approval: dependencies.askApproval,
        session
      });
      if (!result.ok) {
        dependencies.writeError(`任务启动失败：${result.error.code}`);
        continue;
      }
      latestTrace = result.value.trace;
      dependencies.writeOut(`任务状态：${result.value.status}`);
      dependencies.writeOut(result.value.summary);
    }
  } catch {
    dependencies.writeError("会话启动失败");
    return 1;
  }
}

async function readLegacyCredential(
  cwd: string,
  dependencies: InteractiveSessionDependencies
): Promise<{ ok: true; value: string } | { ok: false; code: string }> {
  const credentialPath = join(cwd, ".ai4se", "credentials.json");
  const credentials = dependencies.credentialStoreFactory?.(credentialPath)
    ?? new CredentialStore(credentialPath);
  const masterPassword = await dependencies.readSecret("主密码：");
  const result = await credentials.read(masterPassword);
  return result.ok ? result : { ok: false, code: result.error.code };
}

async function readSystemCredential(
  cwd: string,
  dependencies: InteractiveSessionDependencies
): Promise<{ ok: true; value: string } | { ok: false; code: string }> {
  const path = join(cwd, ".ai4se", "credentials.system.json");
  const vault = dependencies.systemCredentialVaultFactory?.(path)
    ?? new WindowsUserCredentialVault(path);
  const result = await vault.read();
  return result.ok ? result : { ok: false, code: result.error.code };
}
