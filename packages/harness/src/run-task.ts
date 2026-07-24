import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { AgentLoop, type RunResult } from "./agent-loop.js";
import { ApprovalGate, type ApprovalHandler } from "./approval.js";
import { CommandTool } from "./command-tool.js";
import { parseHarnessConfig, type HarnessConfig } from "./config.js";
import { Dispatcher } from "./dispatcher.js";
import { FileTools } from "./file-tools.js";
import { JsonMemory } from "./json-memory.js";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";
import { PolicyEngine } from "./policy.js";
import { Redactor } from "./redactor.js";
import { JsonTrace } from "./trace.js";

export interface RunHarnessTaskOptions {
  readonly cwd: string;
  readonly configPath: string;
  readonly task: string;
  readonly provider: {
    readonly apiKey: string;
    readonly baseUrl?: string;
    readonly model?: string;
  };
  readonly approval?: ApprovalHandler;
}

export type RunTaskErrorCode = "RUN_CONFIG_READ_FAILED" | "RUN_CONFIG_INVALID";

export type RunTaskResult =
  | { readonly ok: true; readonly value: RunResult }
  | {
      readonly ok: false;
      readonly error: { readonly code: RunTaskErrorCode; readonly message: string };
    };

export type RunTaskConfigPreflightResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: { readonly code: RunTaskErrorCode; readonly message: string };
    };

type TaskConfigResult =
  | { readonly ok: true; readonly value: HarnessConfig }
  | {
      readonly ok: false;
      readonly error: { readonly code: RunTaskErrorCode; readonly message: string };
    };

function configFailure(code: RunTaskErrorCode, message: string): TaskConfigResult {
  return { ok: false, error: { code, message } };
}

export async function readHarnessTaskConfig(configPath: string): Promise<TaskConfigResult> {
  let configured: ReturnType<typeof parseHarnessConfig>;
  try {
    configured = parseHarnessConfig(JSON.parse(await readFile(configPath, "utf8")));
  } catch {
    return configFailure("RUN_CONFIG_READ_FAILED", "无法读取本地配置");
  }
  if (!configured.ok) {
    return configFailure("RUN_CONFIG_INVALID", configured.error.code);
  }
  return configured;
}

export async function preflightHarnessTaskConfig(
  configPath: string
): Promise<RunTaskConfigPreflightResult> {
  const configured = await readHarnessTaskConfig(configPath);
  return configured.ok ? { ok: true } : configured;
}

export async function runHarnessTask(options: RunHarnessTaskOptions): Promise<RunTaskResult> {
  const configured = await readHarnessTaskConfig(options.configPath);
  if (!configured.ok) {
    return configured;
  }

  const workspace = resolve(options.cwd);
  const redactor = new Redactor([options.provider.apiKey]);
  const memory = new JsonMemory(resolve(workspace, configured.value.memoryPath), redactor);
  const trace = new JsonTrace(join(workspace, ".ai4se", "trace.json"), redactor);
  const policy = new PolicyEngine({ allowedCommands: configured.value.allowedCommands });
  const approval = new ApprovalGate(options.approval);
  const files = new FileTools(workspace);
  const command = new CommandTool({
    allowedCommands: configured.value.allowedCommands,
    cwd: workspace,
    timeoutMs: configured.value.commandTimeoutMs,
    maxOutputBytes: configured.value.maxOutputBytes
  });
  const dispatcher = new Dispatcher();
  dispatcher.register("read_file", (action) => files.readText(action.path));
  dispatcher.register("write_file", (action) => files.writeText(action.path, action.content));
  dispatcher.register("run_command", (action) => command.execute(action.executable, action.args));
  dispatcher.register("finish", (action) => action.summary);
  const provider = new OpenAICompatibleProvider({
    baseUrl: options.provider.baseUrl ?? configured.value.provider.baseUrl,
    model: options.provider.model ?? configured.value.provider.model,
    apiKey: options.provider.apiKey
  });
  const loop = new AgentLoop({
    provider,
    memory,
    dispatcher,
    trace,
    policy,
    approval,
    redactor,
    maxSteps: configured.value.maxSteps
  });

  return { ok: true, value: await loop.run(options.task) };
}
