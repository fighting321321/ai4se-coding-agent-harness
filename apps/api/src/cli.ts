import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import {
  AgentLoop,
  ApprovalGate,
  CommandTool,
  CredentialStore,
  Dispatcher,
  FileTools,
  JsonMemory,
  JsonTrace,
  OpenAICompatibleProvider,
  PolicyEngine,
  Redactor,
  parseHarnessConfig,
  type ApprovalHandler,
  type ApprovalRequest,
  type CredentialResult,
  type HarnessConfig
} from "@ai4se/harness";

export interface CliDependencies {
  readonly cwd: string;
  readonly readSecret: (prompt: string) => Promise<string>;
  readonly askApproval?: ApprovalHandler;
  readonly writeOut: (message: string) => void;
  readonly writeError: (message: string) => void;
}

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
  const store = new CredentialStore(join(dependencies.cwd, ".ai4se", "credentials.json"));
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

interface TaskArguments {
  readonly task: string;
  readonly configPath: string;
}

function parseTaskArguments(
  args: readonly string[],
  dependencies: CliDependencies
): TaskArguments | number {
  let task: string | undefined;
  let configPath = join(dependencies.cwd, ".ai4se", "config.json");
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--task" && value !== undefined) {
      task = value;
      index += 1;
      continue;
    }
    if (argument === "--config" && value !== undefined) {
      configPath = isAbsolute(value) ? value : resolve(dependencies.cwd, value);
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
  return { task, configPath };
}

async function loadConfig(
  path: string,
  dependencies: CliDependencies
): Promise<HarnessConfig | undefined> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    dependencies.writeError("配置读取失败");
    return undefined;
  }
  const parsed = parseHarnessConfig(input);
  if (!parsed.ok) {
    dependencies.writeError(`配置无效：${parsed.error.code}`);
    return undefined;
  }
  return parsed.value;
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
    return `动作 run_command，可执行文件 ${JSON.stringify(action.executable)}`;
  }
  return "动作 finish";
}

async function runTask(
  arguments_: TaskArguments,
  dependencies: CliDependencies
): Promise<number> {
  const config = await loadConfig(arguments_.configPath, dependencies);
  if (config === undefined) {
    return 1;
  }
  const store = new CredentialStore(join(dependencies.cwd, ".ai4se", "credentials.json"));
  const masterPassword = await dependencies.readSecret("主密码");
  const credential = await store.read(masterPassword);
  if (!credential.ok) {
    dependencies.writeError(`凭据读取失败：${credential.error.code}`);
    return 1;
  }

  const workspace = resolve(dependencies.cwd, config.workspace);
  const redactor = new Redactor([credential.value]);
  const memory = new JsonMemory(resolve(workspace, config.memoryPath), redactor);
  const trace = new JsonTrace(join(workspace, ".ai4se", "trace.json"), redactor);
  const policy = new PolicyEngine({ allowedCommands: config.allowedCommands });
  const approval = new ApprovalGate(
    dependencies.askApproval === undefined
      ? undefined
      : cachedApproval(dependencies.askApproval)
  );
  const files = new FileTools(workspace);
  const command = new CommandTool({
    allowedCommands: config.allowedCommands,
    cwd: workspace,
    timeoutMs: config.commandTimeoutMs,
    maxOutputBytes: config.maxOutputBytes
  });
  const dispatcher = new Dispatcher();
  dispatcher.register("read_file", (action) => files.readText(action.path));
  dispatcher.register("write_file", (action) => files.writeText(action.path, action.content));
  dispatcher.register("run_command", (action) => command.execute(action.executable, action.args));
  dispatcher.register("finish", (action) => action.summary);
  const provider = new OpenAICompatibleProvider({
    ...config.provider,
    apiKey: credential.value
  });
  const result = await new AgentLoop({
    provider,
    memory,
    dispatcher,
    trace,
    policy,
    approval,
    redactor,
    maxSteps: config.maxSteps
  }).run(arguments_.task);

  if (result.status === "completed") {
    dependencies.writeOut("任务状态：completed");
    return 0;
  }
  dependencies.writeError(`任务执行未完成：${result.status}`);
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
    if (args[0] === "credentials") {
      if (args.length !== 2 || args[1] === undefined) {
        dependencies.writeError("凭据命令无效");
        return 2;
      }
      return await runCredentialCommand(args[1], dependencies);
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
