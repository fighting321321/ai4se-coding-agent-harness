import { isAbsolute, join, resolve } from "node:path";

import type { ApprovalHandler, ApprovalRequest } from "./approval.js";
import {
  CredentialStore,
  type CredentialResult,
  type CredentialStoreFactory
} from "./credential-store.js";
import {
  initializeFirstRun,
  type FirstRunInputValidator,
  type SystemCredentialVaultFactory
} from "./first-run.js";
import {
  runInteractiveSession,
  type InteractiveSessionDependencies
} from "./interactive-session.js";
import { runOfflineSmoke } from "./offline-smoke.js";
import { preflightHarnessTaskConfig, runHarnessTask } from "./run-task.js";

export interface CliDependencies {
  readonly cwd: string;
  readonly isTty?: boolean;
  readonly credentialStoreFactory?: CredentialStoreFactory;
  readonly systemCredentialVaultFactory?: SystemCredentialVaultFactory;
  readonly validateFirstRunInput?: FirstRunInputValidator;
  readonly readSecret: (prompt: string) => Promise<string>;
  readonly readLine?: InteractiveSessionDependencies["readLine"];
  readonly askApproval?: ApprovalHandler;
  readonly clearScreen?: () => void;
  readonly writeOut: (message: string) => void;
  readonly writeError: (message: string) => void;
}

const HELP = [
  "AI4SE Coding Agent Harness",
  "",
  "用法：",
  "  ai4se-harness",
  "  ai4se-harness start [--config <path>]",
  "  ai4se-harness --task <task> [--config <path>]",
  "  ai4se-harness credentials <init|status|update|clear>",
  "  ai4se-harness smoke",
  "  ai4se-harness --help"
].join("\n");

const FORBIDDEN_SECRET_OPTIONS = new Set([
  "--api-key",
  "--password",
  "--master-password",
  "--secret",
  "--token"
]);

function containsSecretOption(args: readonly string[]): boolean {
  return args.some((argument) => {
    const name = argument.split("=", 1)[0]?.toLowerCase();
    return name !== undefined && FORBIDDEN_SECRET_OPTIONS.has(name);
  });
}

function credentialFailure(
  result: CredentialResult<unknown>,
  dependencies: CliDependencies
): number {
  if (result.ok) {
    return 0;
  }
  dependencies.writeError(`凭据操作失败：${result.error.code}`);
  return 1;
}

async function runCredentialCommand(
  command: string,
  dependencies: CliDependencies
): Promise<number> {
  const store = createCredentialStore(dependencies);
  if (command === "status") {
    const result = await store.status();
    if (!result.ok) {
      return credentialFailure(result, dependencies);
    }
    dependencies.writeOut(`凭据状态：${result.value}`);
    return 0;
  }
  if (command !== "init" && command !== "update" && command !== "clear") {
    dependencies.writeError("凭据命令无效");
    return 2;
  }

  const masterPassword = await dependencies.readSecret("主密码");
  if (command === "clear") {
    const result = await store.clear(masterPassword);
    if (!result.ok) {
      return credentialFailure(result, dependencies);
    }
    dependencies.writeOut("凭据清除成功");
    return 0;
  }
  const apiKey = await dependencies.readSecret("API Key");
  const result = command === "init"
    ? await store.init(masterPassword, apiKey)
    : await store.update(masterPassword, apiKey);
  if (!result.ok) {
    return credentialFailure(result, dependencies);
  }
  dependencies.writeOut(command === "init" ? "凭据初始化成功" : "凭据更新成功");
  return 0;
}

function createCredentialStore(dependencies: CliDependencies) {
  const path = join(dependencies.cwd, ".ai4se", "credentials.json");
  return dependencies.credentialStoreFactory?.(path) ?? new CredentialStore(path);
}

interface TaskArguments {
  readonly task: string;
  readonly configPath: string;
}

function configPathFromArgs(
  args: readonly string[],
  dependencies: CliDependencies
): string | number {
  let configPath = join(dependencies.cwd, ".ai4se", "config.json");
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--config" && value !== undefined) {
      configPath = isAbsolute(value) ? value : resolve(dependencies.cwd, value);
      index += 1;
      continue;
    }
    dependencies.writeError("命令参数无效");
    return 2;
  }
  return configPath;
}

function parseTaskArguments(
  args: readonly string[],
  dependencies: CliDependencies
): TaskArguments | number {
  let task: string | undefined;
  const configArgs: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--task" && value !== undefined) {
      task = value;
      index += 1;
      continue;
    }
    if (argument === "--config" && value !== undefined) {
      configArgs.push(argument, value);
      index += 1;
      continue;
    }
    dependencies.writeError("命令参数无效");
    return 2;
  }
  if (task === undefined || task.trim().length === 0) {
    dependencies.writeError("任务参数必须是非空字符串");
    return 2;
  }
  const configPath = configPathFromArgs(configArgs, dependencies);
  return typeof configPath === "number" ? configPath : { task, configPath };
}

function cachedApproval(handler: ApprovalHandler): ApprovalHandler {
  let answer: boolean | undefined;
  return async (request: ApprovalRequest) => {
    if (answer === undefined) {
      answer = await handler(request);
    }
    return answer;
  };
}

export function formatApprovalRequest(request: ApprovalRequest): string {
  const action = request.action;
  if (action.type === "read_file" || action.type === "write_file") {
    return `动作 ${action.type}，目标 ${JSON.stringify(action.path)}`;
  }
  if (action.type === "run_command") {
    const command = [action.executable, ...action.args]
      .map((part) => JSON.stringify(part))
      .join(" ");
    return `动作 run_command，命令 ${command}`;
  }
  return "动作 finish";
}

async function runTask(
  arguments_: TaskArguments,
  dependencies: CliDependencies
): Promise<number> {
  const configuration = await preflightHarnessTaskConfig(arguments_.configPath);
  if (!configuration.ok) {
    dependencies.writeError(
      configuration.error.code === "RUN_CONFIG_READ_FAILED"
        ? "配置读取失败"
        : `配置无效：${configuration.error.message}`
    );
    return 1;
  }
  const store = createCredentialStore(dependencies);
  const masterPassword = await dependencies.readSecret("主密码");
  const credential = await store.read(masterPassword);
  if (!credential.ok) {
    dependencies.writeError(`凭据读取失败：${credential.error.code}`);
    return 1;
  }

  const result = await runHarnessTask({
    cwd: dependencies.cwd,
    configPath: arguments_.configPath,
    task: arguments_.task,
    provider: { apiKey: credential.value },
    approval: dependencies.askApproval === undefined
      ? undefined
      : cachedApproval(dependencies.askApproval)
  });
  if (!result.ok) {
    dependencies.writeError(
      result.error.code === "RUN_CONFIG_READ_FAILED"
        ? "配置读取失败"
        : `配置无效：${result.error.message}`
    );
    return 1;
  }

  if (result.value.status === "completed") {
    dependencies.writeOut("任务状态：completed");
    return 0;
  }
  dependencies.writeError(`任务执行未完成：${result.value.status}`);
  return 1;
}

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies
): Promise<number> {
  if (containsSecretOption(args)) {
    dependencies.writeError("参数包含禁止的敏感选项");
    return 2;
  }

  try {
    if (args[0] === "smoke") {
      if (args.length > 1) {
        dependencies.writeError("命令参数无效");
        return 2;
      }
      dependencies.writeOut(await runOfflineSmoke());
      return 0;
    }
    if (args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
      dependencies.writeOut(HELP);
      return 0;
    }
    if (args[0] === "credentials") {
      if (args.length !== 2 || args[1] === undefined) {
        dependencies.writeError("凭据命令无效");
        return 2;
      }
      return await runCredentialCommand(args[1], dependencies);
    }
    if (args.length === 0) {
      if (dependencies.isTty === false || dependencies.readLine === undefined) {
        dependencies.writeError("交互会话需要 TTY");
        return 1;
      }
      const initialized = await initializeFirstRun(
        { cwd: dependencies.cwd },
        {
          readLine: dependencies.readLine,
          readSecret: dependencies.readSecret,
          systemCredentialVaultFactory: dependencies.systemCredentialVaultFactory,
          validateInput: dependencies.validateFirstRunInput
        }
      );
      if (!initialized.ok) {
        dependencies.writeError(`首次初始化失败：${initialized.error.code}`);
        return 1;
      }
      return await runInteractiveSession(
        {
          cwd: dependencies.cwd,
          configPath: join(dependencies.cwd, ".ai4se", "config.json"),
          credentialMode: "system"
        },
        {
          readSecret: dependencies.readSecret,
          systemCredentialVaultFactory: dependencies.systemCredentialVaultFactory,
          readLine: dependencies.readLine,
          askApproval: dependencies.askApproval,
          clearScreen: dependencies.clearScreen,
          writeOut: dependencies.writeOut,
          writeError: dependencies.writeError
        }
      );
    }
    if (args[0] === "start") {
      if (dependencies.isTty === false || dependencies.readLine === undefined) {
        dependencies.writeError("交互会话需要 TTY");
        return 1;
      }
      const configPath = configPathFromArgs(
        args.slice(1),
        dependencies
      );
      if (typeof configPath === "number") {
        return configPath;
      }
      return await runInteractiveSession(
        { cwd: dependencies.cwd, configPath },
        {
          readSecret: dependencies.readSecret,
          credentialStoreFactory: dependencies.credentialStoreFactory,
          readLine: dependencies.readLine,
          askApproval: dependencies.askApproval,
          clearScreen: dependencies.clearScreen,
          writeOut: dependencies.writeOut,
          writeError: dependencies.writeError
        }
      );
    }
    const parsed = parseTaskArguments(args, dependencies);
    return typeof parsed === "number"
      ? parsed
      : await runTask(parsed, dependencies);
  } catch {
    dependencies.writeError("CLI 操作失败");
    return 1;
  }
}
