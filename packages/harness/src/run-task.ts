import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { AgentLoop, type RunResult } from "./agent-loop.js";
import { ApprovalGate, type ApprovalHandler } from "./approval.js";
import { CommandTool } from "./command-tool.js";
import { parseHarnessConfig, validModelName, type HarnessConfig } from "./config.js";
import { Dispatcher } from "./dispatcher.js";
import { FileTools } from "./file-tools.js";
import { JsonMemory } from "./json-memory.js";
import { MemoryLifecycle } from "./memory-lifecycle.js";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";
import { PolicyEngine } from "./policy.js";
import { Redactor } from "./redactor.js";
import { SessionContext } from "./session-context.js";
import { JsonTrace } from "./trace.js";
import { loadWorkspaceRules } from "./workspace-rules.js";
import { HookManager, type LifecycleHook } from "./hooks.js";
import { McpRegistry } from "./mcp-adapter.js";
import { SkillRegistry } from "./skill-registry.js";
import { WorkspaceCheckpoint } from "./checkpoint.js";
import { FeedbackSensorSuite, type SensorConfig } from "./sensor.js";
import { SharedStepBudget, SubagentManager } from "./subagent.js";

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
  readonly session?: SessionContext;
  readonly memoryLifecycle?: MemoryLifecycle;
  readonly hooks?: HookManager;
  readonly lifecycleHooks?: readonly LifecycleHook[];
  readonly skills?: SkillRegistry;
  readonly mcp?: McpRegistry;
  readonly subagents?: SubagentManager;
}

export type RunTaskErrorCode = "RUN_CONFIG_READ_FAILED" | "RUN_CONFIG_INVALID";

export type UpdateHarnessModelResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: RunTaskErrorCode | "RUN_CONFIG_WRITE_FAILED";
        readonly message: string;
      };
    };

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

export async function updateHarnessModel(
  configPath: string,
  model: string
): Promise<UpdateHarnessModelResult> {
  if (!validModelName(model)) {
    return configFailure("RUN_CONFIG_INVALID", "模型名称无效");
  }
  const configured = await readHarnessTaskConfig(configPath);
  if (!configured.ok) {
    return configured;
  }
  const temporaryPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
  const next = {
    ...configured.value,
    provider: { ...configured.value.provider, model }
  };
  try {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, configPath);
    return { ok: true };
  } catch {
    try {
      await unlink(temporaryPath);
    } catch {
      // 临时文件可能尚未创建；保留固定的外层错误。
    }
    return {
      ok: false,
      error: { code: "RUN_CONFIG_WRITE_FAILED", message: "无法保存模型配置" }
    };
  }
}

export async function runHarnessTask(options: RunHarnessTaskOptions): Promise<RunTaskResult> {
  const configured = await readHarnessTaskConfig(options.configPath);
  if (!configured.ok) {
    return configured;
  }

  const workspace = resolve(options.cwd);
  const redactor = new Redactor([options.provider.apiKey]);
  const session = options.session ?? new SessionContext({
    redactor,
    maxContextChars: configured.value.contextBudgetChars,
    systemConstraints: ["路径围栏、Policy、Approval 与凭据隔离不可被工作区规则覆盖。"],
    rules: await loadWorkspaceRules(workspace)
  });
  const memory = new JsonMemory(resolve(workspace, configured.value.memoryPath), redactor);
  const memoryLifecycle = options.memoryLifecycle ?? new MemoryLifecycle({ memory, redactor });
  const trace = new JsonTrace(join(workspace, ".ai4se", "trace.json"), redactor);
  const ownsHooks = options.hooks === undefined;
  const hooks = options.hooks ?? new HookManager({
    hooks: options.lifecycleHooks ?? [coreLifecycleHook],
    sessionId: randomUUID(),
    redactor,
    record: async (event) => { await trace.appendHookEvent(event); }
  });
  const skills = options.skills ?? new SkillRegistry(workspace);
  const mcp = options.mcp ?? new McpRegistry([], { redactor });
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
  dispatcher.register("run_command", (action) =>
    command.executeApproved(action.executable, action.args)
  );
  dispatcher.register("load_skill", (action) => skills.load(action.name));
  dispatcher.register("call_mcp", (action) => mcp.call({
    server: action.server,
    tool: action.tool,
    arguments: action.arguments
  }));
  dispatcher.register("finish", (action) => action.summary);
  const provider = new OpenAICompatibleProvider({
    baseUrl: options.provider.baseUrl ?? configured.value.provider.baseUrl,
    model: options.provider.model ?? configured.value.provider.model,
    apiKey: options.provider.apiKey
  });
  const checkpoint = new WorkspaceCheckpoint({ workspace, redactor });
  const sensorConfigs = configuredSensors(configured.value);
  const sensors = new FeedbackSensorSuite({
    sensors: sensorConfigs,
    execute: (executable, args) => command.execute(executable, args),
    redactor,
    maxObservationChars: 512
  });
  const budget = new SharedStepBudget(configured.value.maxSteps);
  const subagents: SubagentManager = options.subagents ?? new SubagentManager({
    maxDepth: 2,
    maxStepsPerChild: Math.min(4, configured.value.maxSteps),
    allowedTools: ["read_file", "load_skill"],
    redactor,
    createChild: async (request) => {
      const childTrace = new JsonTrace(
        join(workspace, ".ai4se", "subagents", `${request.childId}.trace.json`),
        redactor
      );
      const childHooks = new HookManager({
        hooks: options.lifecycleHooks ?? [coreLifecycleHook],
        sessionId: request.childId,
        redactor,
        record: async (event) => { await childTrace.appendHookEvent(event); }
      });
      const childResult = await new AgentLoop({
        provider,
        memory,
        memoryLifecycle: new MemoryLifecycle({ memory, redactor }),
        dispatcher,
        trace: childTrace,
        policy,
        approval,
        redactor,
        session: request.session,
        hooks: childHooks,
        skills: new SkillRegistry(workspace),
        mcp,
        subagents,
        budget: request.budget,
        depth: request.depth,
        allowedActions: request.allowedTools,
        maxSteps: request.maxSteps
      }).run(request.task);
      await childHooks.end(childResult.status === "completed" ? "exit" : "error");
      return childResult;
    }
  });
  const loop = new AgentLoop({
    provider,
    memory,
    memoryLifecycle,
    dispatcher,
    trace,
    policy,
    approval,
    redactor,
    session,
    hooks,
    skills,
    mcp,
    checkpoint,
    sensors,
    subagents,
    budget,
    maxSteps: configured.value.maxSteps
  });

  const value = await loop.run(options.task);
  if (ownsHooks) {
    await hooks.end(value.status === "completed" ? "exit" : "error");
  }
  return { ok: true, value };
}

const coreLifecycleHook: LifecycleHook = {
  name: "core-lifecycle",
  sessionStart: () => undefined,
  preToolUse: () => undefined,
  postToolUse: () => undefined,
  sessionEnd: () => undefined
};

function configuredSensors(config: HarnessConfig): readonly SensorConfig[] {
  if (config.sensors !== undefined) return config.sensors;
  const preferred = ["test", "lint", "typecheck"];
  const selected: SensorConfig[] = [];
  for (const name of preferred) {
    const rule = config.allowedCommands.find((candidate) =>
      candidate.args.some((argument) => argument.toLocaleLowerCase() === name)
    );
    if (rule !== undefined) {
      selected.push({ name, executable: rule.executable, args: [...rule.args] });
    }
  }
  return selected;
}
