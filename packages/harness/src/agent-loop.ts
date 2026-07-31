import { parseAction } from "./action-parser.js";
import { ApprovalGate } from "./approval.js";
import type { Dispatcher } from "./dispatcher.js";
import { classifyFeedback } from "./feedback.js";
import type { JsonMemory } from "./json-memory.js";
import type { LLMOutput, LLMProvider } from "./llm-provider.js";
import { MemoryLifecycle } from "./memory-lifecycle.js";
import type { PolicyEngine } from "./policy.js";
import { Redactor } from "./redactor.js";
import { SessionContext } from "./session-context.js";
import type { JsonTrace, TraceEntry } from "./trace.js";
import { HookManager } from "./hooks.js";
import type { McpRegistry } from "./mcp-adapter.js";
import type { SkillRegistry } from "./skill-registry.js";
import type { Action } from "./action.js";
import type { WorkspaceCheckpoint, CheckpointSnapshot } from "./checkpoint.js";
import type { FeedbackSensorSuite, SensorObservation } from "./sensor.js";
import { SharedStepBudget, type SubagentManager } from "./subagent.js";
import type { FeedbackResult } from "./feedback.js";
import type { TraceDetail } from "./trace.js";

export type RunStatus = "completed" | "blocked" | "failed" | "max_steps";

export interface RunResult {
  status: RunStatus;
  summary: string;
  steps: number;
  trace: readonly TraceEntry[];
}

export interface AgentLoopOptions {
  provider: LLMProvider;
  memory: JsonMemory;
  memoryLifecycle?: MemoryLifecycle;
  dispatcher: Dispatcher;
  trace: JsonTrace;
  policy: PolicyEngine;
  approval?: ApprovalGate;
  redactor?: Redactor;
  session?: SessionContext;
  hooks?: HookManager;
  skills?: SkillRegistry;
  mcp?: McpRegistry;
  maxSteps?: number;
  checkpoint?: WorkspaceCheckpoint;
  sensors?: FeedbackSensorSuite;
  subagents?: SubagentManager;
  budget?: SharedStepBudget;
  depth?: number;
  allowedActions?: readonly Action["type"][];
}

const DEFAULT_MAX_STEPS = 8;

const PROVIDER_STOP_REASONS = new Map<string, string>([
  ["PROVIDER_AUTHENTICATION_FAILED", "provider_authentication_failed"],
  ["PROVIDER_RATE_LIMITED", "provider_rate_limited"],
  ["PROVIDER_SERVER_ERROR", "provider_server_error"],
  ["PROVIDER_HTTP_ERROR", "provider_http_error"],
  ["PROVIDER_NETWORK_ERROR", "provider_network_error"],
  ["PROVIDER_RESPONSE_INVALID", "provider_response_invalid"],
  ["PROVIDER_ACTION_INVALID", "provider_action_invalid"]
]);

function providerStopReason(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "provider_error";
  }
  return typeof error.code === "string"
    ? PROVIDER_STOP_REASONS.get(error.code) ?? "provider_error"
    : "provider_error";
}

function isApprovalBlock(code: string): boolean {
  return code === "POLICY_DENIED" || code === "APPROVAL_REQUIRED" || code === "APPROVAL_DENIED";
}

export class AgentLoop {
  readonly #provider: LLMProvider;
  readonly #memoryLifecycle: MemoryLifecycle;
  readonly #dispatcher: Dispatcher;
  readonly #trace: JsonTrace;
  readonly #policy: PolicyEngine;
  readonly #approval: ApprovalGate;
  readonly #maxSteps: number;
  readonly #redactor: Redactor;
  readonly #session: SessionContext;
  readonly #hooks: HookManager;
  readonly #skills: SkillRegistry | undefined;
  readonly #mcp: McpRegistry | undefined;
  readonly #checkpoint: WorkspaceCheckpoint | undefined;
  readonly #sensors: FeedbackSensorSuite | undefined;
  readonly #subagents: SubagentManager | undefined;
  readonly #budget: SharedStepBudget;
  readonly #depth: number;
  readonly #allowedActions: ReadonlySet<Action["type"]> | undefined;
  #traceUserInput: string | undefined;
  #traceAssistantOutput: string | undefined;
  #traceApproval: TraceEntry["approval"];
  #traceMemoryRetrieved: number | undefined;

  constructor(options: AgentLoopOptions) {
    this.#provider = options.provider;
    this.#dispatcher = options.dispatcher;
    this.#trace = options.trace;
    this.#policy = options.policy;
    this.#approval = options.approval ?? new ApprovalGate();
    this.#redactor = options.redactor ?? new Redactor();
    this.#memoryLifecycle = options.memoryLifecycle ?? new MemoryLifecycle({
      memory: options.memory,
      redactor: this.#redactor
    });
    this.#session = options.session ?? new SessionContext({ redactor: this.#redactor });
    this.#hooks = options.hooks ?? new HookManager({ redactor: this.#redactor });
    this.#skills = options.skills;
    this.#mcp = options.mcp;
    this.#maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    if (!Number.isInteger(this.#maxSteps) || this.#maxSteps < 1) {
      throw new Error("maxSteps 必须是正整数");
    }
    this.#checkpoint = options.checkpoint;
    this.#sensors = options.sensors;
    this.#subagents = options.subagents;
    this.#budget = options.budget ?? new SharedStepBudget(this.#maxSteps);
    this.#depth = options.depth ?? 0;
    this.#allowedActions = options.allowedActions === undefined
      ? undefined
      : new Set([...options.allowedActions, "finish"]);
    if (!Number.isInteger(this.#depth) || this.#depth < 0) {
      throw new Error("depth 必须是非负整数");
    }
  }

  async #result(
    status: RunStatus,
    summary: string,
    steps: number,
    traceStartStep: number
  ): Promise<RunResult> {
    const current = await this.#trace.read();
    if (!current.ok) {
      return {
        status: "failed",
        summary: "Trace 读取失败",
        steps,
        trace: []
      };
    }
    return {
      status,
      summary,
      steps,
      trace: current.value.filter((entry) => entry.step >= traceStartStep)
    };
  }

  async #append(entry: TraceEntry): Promise<boolean> {
    const details = [
      ...(entry.details ?? []),
      ...(this.#traceMemoryRetrieved === undefined || entry.details?.some((detail) => detail.type === "memory")
        ? []
        : [{ type: "memory" as const, phase: "retrieved" as const, count: this.#traceMemoryRetrieved }])
    ];
    const appended = await this.#trace.append({
      ...entry,
      sessionId: this.#hooks.sessionId,
      ...(this.#traceUserInput === undefined ? {} : { userInputSummary: this.#traceUserInput }),
      ...(this.#traceAssistantOutput === undefined ? {} : { assistantOutputSummary: this.#traceAssistantOutput }),
      approval: entry.approval ?? this.#traceApproval ?? approvalFromPolicy(entry.policy),
      ...(details.length === 0 ? {} : { details })
    });
    return appended.ok;
  }

  async run(task: string): Promise<RunResult> {
    this.#traceUserInput = this.#redactor.redactText(task);
    this.#traceAssistantOutput = undefined;
    this.#traceApproval = undefined;
    this.#traceMemoryRetrieved = undefined;
    const currentTrace = await this.#trace.read();
    if (!currentTrace.ok) {
      return { status: "failed", summary: "Trace 读取失败", steps: 1, trace: [] };
    }
    const traceStartStep = currentTrace.value.reduce(
      (next, entry) => Math.max(next, entry.step + 1),
      1
    );
    const started = await this.#hooks.start();
    if (!started.ok) {
      await this.#append({
        step: traceStartStep,
        policy: "allow",
        observation: `environment_error: ${started.error.code}`,
        status: "failed",
        stopReason: "hook_failed"
      });
      return await this.#result("failed", "会话启动 Hook 失败", 1, traceStartStep);
    }
    this.#session.beginTurn(task);
    this.#memoryLifecycle.collectExplicitConvention(task);
    let observations: readonly string[] = [];
    let businessFailures = 0;

    const memory = await this.#memoryLifecycle.retrieve(task);
    if (!memory.ok) {
      this.#session.appendObservation("environment_error: Memory search failed");
      const appended = await this.#append({
        step: traceStartStep,
        policy: "allow",
        observation: "environment_error: Memory search failed",
        status: "failed",
        stopReason: "memory_error"
      });
      return appended
        ? await this.#result("failed", "Memory 检索失败", 1, traceStartStep)
        : await this.#result("failed", "Trace 写入失败", 1, traceStartStep);
    }
    const memoryContext = memory.value.map((item) => item.content);
    this.#traceMemoryRetrieved = memory.value.length;
    const skillCards = this.#skills === undefined
      ? { ok: true as const, value: [] }
      : await this.#skills.discover();
    if (!skillCards.ok) {
      this.#session.appendObservation("environment_error: Skill discovery failed");
      await this.#append({
        step: traceStartStep,
        policy: "allow",
        observation: "environment_error: Skill discovery failed",
        status: "failed",
        stopReason: "skill_discovery_failed"
      });
      return await this.#result("failed", "Skill 发现失败", 1, traceStartStep);
    }
    const mcpCards = this.#mcp === undefined
      ? { ok: true as const, value: [] }
      : await this.#mcp.discover();
    if (!mcpCards.ok) {
      this.#session.appendObservation("environment_error: MCP discovery failed");
      await this.#append({
        step: traceStartStep,
        policy: "allow",
        observation: "environment_error: MCP discovery failed",
        status: "failed",
        stopReason: "mcp_discovery_failed"
      });
      return await this.#result("failed", "MCP 发现失败", 1, traceStartStep);
    }

    for (let iteration = 1; iteration <= this.#maxSteps; iteration += 1) {
      const step = traceStartStep + iteration - 1;
      if (!this.#budget.consume()) {
        await this.#append({
          step,
          policy: "allow",
          observation: "blocked: SHARED_BUDGET_EXHAUSTED",
          status: "failed",
          stopReason: "shared_budget_exhausted",
          details: [{ type: "budget", used: this.#budget.used, remaining: this.#budget.remaining }]
        });
        return await this.#result("max_steps", "父子共享步骤预算已耗尽", iteration - 1, traceStartStep);
      }
      let output: LLMOutput;
      try {
        output = await this.#provider.complete(this.#session.toExtendedLLMInput(
          task,
          memoryContext,
          observations,
          {
            capabilities: {
              builtins: ["read_file", "write_file", "run_command", "load_skill", "call_mcp", "delegate_agent", "finish"]
                .filter((type) => type !== "delegate_agent" || this.#subagents !== undefined)
                .filter((type) => this.#allowedActions === undefined || this.#allowedActions.has(type as Action["type"])),
              skills: skillCards.value,
              mcp: mcpCards.value
            },
            skillInstructions: this.#skills?.loadedInstructions() ?? []
          }
        ));
      } catch (error) {
        this.#session.appendObservation("environment_error: Provider failed");
        const appended = await this.#append({
          step,
          policy: "allow",
          observation: "environment_error: Provider failed",
          status: "failed",
          stopReason: providerStopReason(error)
        });
        return appended
          ? await this.#result("failed", "Provider 调用失败", iteration, traceStartStep)
          : await this.#result("failed", "Trace 写入失败", iteration, traceStartStep);
      }

      this.#traceAssistantOutput = this.#redactor.redactText(
        typeof output.assistantText === "string" ? output.assistantText : JSON.stringify(output.raw)
      );

      this.#session.appendAssistant(
        typeof output.assistantText === "string" ? output.assistantText : JSON.stringify(output.raw)
      );

      const parsed = parseAction(output.raw);
      if (!parsed.ok) {
        this.#session.appendObservation("environment_error: Action parse failed");
        const appended = await this.#append({
          step,
          policy: "allow",
          observation: "environment_error: Action parse failed",
          status: "failed",
          stopReason: "parse_error"
        });
        return appended
          ? await this.#result("failed", "Action 解析失败", iteration, traceStartStep)
          : await this.#result("failed", "Trace 写入失败", iteration, traceStartStep);
      }

      const action = parsed.value;
      this.#session.appendAction(action);
      if (this.#allowedActions !== undefined && !this.#allowedActions.has(action.type)) {
        this.#session.appendObservation("blocked: SUBAGENT_TOOL_DENIED");
        await this.#append({
          step,
          action,
          policy: "deny",
          observation: "blocked: SUBAGENT_TOOL_DENIED",
          status: "blocked",
          stopReason: "subagent_tool_denied",
          details: [{ type: "budget", used: this.#budget.used, remaining: this.#budget.remaining }]
        });
        return await this.#result("blocked", "子 Agent 工具未获授权", iteration, traceStartStep);
      }
      if (action.type !== "finish" && this.#redactor.containsSensitive(action)) {
        this.#session.appendObservation("blocked: SENSITIVE_ACTION");
        const appended = await this.#append({
          step,
          action,
          policy: "deny",
          observation: "blocked: SENSITIVE_ACTION",
          status: "blocked",
          stopReason: "sensitive_action"
        });
        return appended
          ? await this.#result("blocked", "动作包含敏感信息", iteration, traceStartStep)
          : await this.#result("failed", "Trace 写入失败", iteration, traceStartStep);
      }
      const decision = this.#policy.evaluate(action);
      this.#traceApproval = approvalFromPolicy(decision);
      if (decision === "deny") {
        this.#session.appendObservation("blocked: POLICY_DENIED");
        const appended = await this.#append({
          step,
          action,
          policy: decision,
          observation: "blocked: POLICY_DENIED",
          status: "blocked",
          stopReason: "policy_denied"
        });
        return appended
          ? await this.#result("blocked", "策略拒绝该动作", iteration, traceStartStep)
          : await this.#result("failed", "Trace 写入失败", iteration, traceStartStep);
      }

      if (action.type === "finish") {
        this.#session.appendObservation("pass: finish");
        this.#memoryLifecycle.collectCompletedTask(task, action.summary);
        const appended = await this.#trace.append({
          step,
          sessionId: this.#hooks.sessionId,
          userInputSummary: this.#traceUserInput,
          assistantOutputSummary: this.#traceAssistantOutput,
          action,
          policy: decision,
          approval: "not_required",
          observation: "pass: finish",
          status: "completed",
          stopReason: "finish",
          details: [
            { type: "memory", phase: "retrieved", count: this.#traceMemoryRetrieved ?? 0 },
            { type: "memory", phase: "candidate_collected", count: this.#memoryLifecycle.pending().length },
            { type: "budget", used: this.#budget.used, remaining: this.#budget.remaining }
          ]
        });
        if (!appended.ok) {
          return await this.#result("failed", "Trace 写入失败", iteration, traceStartStep);
        }
        const summary =
          appended.value.action?.type === "finish" ? appended.value.action.summary : action.summary;
        return await this.#result("completed", summary, iteration, traceStartStep);
      }

      const details: TraceDetail[] = [];
      let snapshot: CheckpointSnapshot | undefined;
      const approval = await this.#approval.execute(decision, { action }, async () => {
        const hooked = await this.#hooks.aroundTool(action, async () => {
          if (action.type === "run_command" || action.type === "call_mcp") {
            details.push({
              type: "rollback_limit",
              actionType: action.type,
              reason: "external_side_effect_not_snapshot_capable"
            });
          }
          if (action.type === "write_file" && this.#checkpoint !== undefined) {
            const captured = await this.#checkpoint.capture(action.path);
            if (!captured.ok) return { ok: false as const, error: captured.error };
            snapshot = captured.value;
            details.push({ type: "checkpoint_created", path: captured.value.path });
          }
          if (action.type === "load_skill" && this.#skills !== undefined) {
            return await this.#skills.load(action.name);
          }
          if (action.type === "delegate_agent") {
            details.push({
              type: "subagent",
              phase: "started",
              parentSessionId: this.#hooks.sessionId,
              depth: this.#depth + 1
            });
            if (this.#subagents === undefined) {
              return { ok: false as const, error: { code: "SUBAGENT_FAILED", message: "子 Agent 未配置" } };
            }
            return await this.#subagents.delegate(
              { task: action.task, allowedTools: action.allowedTools },
              { depth: this.#depth, budget: this.#budget }
            );
          }
          return await this.#dispatcher.execute(action);
        });
        return hooked.ok
          ? hooked.value
          : { ok: false as const, error: hooked.error };
      });
      this.#traceApproval = decision !== "ask"
        ? "not_required"
        : approval.ok
          ? "approved"
          : approval.error.code === "APPROVAL_FAILED"
            ? "failed"
            : approval.error.code === "APPROVAL_REQUIRED"
              ? "required"
              : "denied";
      const dispatched = approval.ok
        ? approval.value
        : { ok: false as const, error: approval.error };
      const restoreCheckpoint = async (): Promise<string | undefined> => {
        if (snapshot === undefined || this.#checkpoint === undefined) return undefined;
        const restored = await this.#checkpoint.restore(snapshot);
        details.push(restored.ok
          ? { type: "checkpoint_restored", path: snapshot.path, ok: true }
          : { type: "checkpoint_restored", path: snapshot.path, ok: false, code: restored.error.code });
        return restored.ok ? undefined : restored.error.code;
      };
      if (!dispatched.ok && isApprovalBlock(dispatched.error.code)) {
        this.#session.appendObservation(`blocked: ${dispatched.error.code}`);
        const appended = await this.#append({
          step,
          action,
          policy: decision,
          observation: `blocked: ${dispatched.error.code}`,
          status: "blocked",
          stopReason: dispatched.error.code
        });
        return appended
          ? await this.#result("blocked", "动作未获批准", iteration, traceStartStep)
          : await this.#result("failed", "Trace 写入失败", iteration, traceStartStep);
      }
      if (!dispatched.ok && dispatched.error.code === "HOOK_BLOCKED") {
        this.#session.appendObservation("blocked: HOOK_BLOCKED");
        await this.#append({
          step,
          action,
          policy: decision,
          observation: "blocked: HOOK_BLOCKED",
          status: "blocked",
          stopReason: "hook_blocked"
        });
        return await this.#result("blocked", "生命周期 Hook 阻断该动作", iteration, traceStartStep);
      }
      if (!dispatched.ok && dispatched.error.code === "HOOK_FAILED") {
        const restoreError = await restoreCheckpoint();
        const hookObservation = restoreError === undefined
          ? "environment_error: HOOK_FAILED"
          : `environment_error: ${restoreError}`;
        this.#session.appendObservation(hookObservation);
        await this.#append({
          step,
          action,
          policy: decision,
          observation: hookObservation,
          status: "failed",
          stopReason: restoreError === undefined ? "hook_failed" : "checkpoint_restore_failed",
          details
        });
        return await this.#result("failed", "生命周期 Hook 执行失败", iteration, traceStartStep);
      }

      let feedback = classifyFeedback(dispatched, this.#redactor);

      const restore = async (): Promise<boolean> => {
        const restoreError = await restoreCheckpoint();
        if (restoreError !== undefined) {
          feedback = { category: "environment_error", observation: `environment_error: ${restoreError}` };
        }
        return restoreError === undefined;
      };

      if (action.type === "delegate_agent" && dispatched.ok && dispatched.value !== undefined && dispatched.value !== null &&
          typeof dispatched.value === "object" && "childId" in dispatched.value &&
          "status" in dispatched.value && "steps" in dispatched.value && "summary" in dispatched.value) {
        const child = dispatched.value as { childId: string; status: string; steps: number; summary: string };
        details.push({
          type: "subagent", phase: "completed", parentSessionId: this.#hooks.sessionId,
          childSessionId: child.childId, depth: this.#depth + 1, steps: child.steps, status: child.status
        });
        feedback = { category: child.status === "completed" ? "pass" : "fail", observation: `${child.status}: subagent: ${child.summary}` };
      }

      if (feedback.category !== "pass") {
        await restore();
      } else if (action.type === "write_file" && this.#sensors !== undefined) {
        const sensorResults: readonly SensorObservation[] = await this.#sensors.run();
        details.push(...sensorResults.map((result): TraceDetail => ({ type: "sensor", ...result })));
        const failedSensor = sensorResults.find((result) => result.category !== "pass");
        if (failedSensor === undefined) {
          feedback = {
            category: "pass",
            observation: sensorResults.length === 0
              ? "pass: write completed; no sensors enabled"
              : `pass: sensors ${sensorResults.map((result) => result.name).join(", ")}`
          };
        } else {
          feedback = { category: failedSensor.category, observation: failedSensor.observation } as FeedbackResult;
          await restore();
        }
      }
      if (feedback.category === "pass" && snapshot !== undefined && this.#checkpoint !== undefined) {
        const discarded = this.#checkpoint.discard(snapshot);
        if (!discarded.ok) {
          feedback = {
            category: "environment_error",
            observation: `environment_error: ${discarded.error.code}`
          };
        }
      }
      details.push({ type: "budget", used: this.#budget.used, remaining: this.#budget.remaining });
      this.#session.appendObservation(feedback.observation);
      if (feedback.category === "fail") {
        businessFailures += 1;
      }

      const secondBusinessFailure = businessFailures >= 2;
      const limitReached = iteration === this.#maxSteps;
      const traceStatus =
        secondBusinessFailure ||
        feedback.category === "timeout" ||
        feedback.category === "environment_error" ||
        limitReached
          ? "failed"
          : "running";
      const stopReason = secondBusinessFailure
        ? "second_business_failure"
        : feedback.category === "timeout"
          ? "timeout"
          : feedback.category === "environment_error"
            ? "environment_error"
            : limitReached
              ? "max_steps"
              : undefined;
      const appended = await this.#append({
        step,
        action,
        policy: decision,
        observation: feedback.observation,
        status: traceStatus,
        ...(stopReason === undefined ? {} : { stopReason }),
        details
      });
      if (!appended) {
        return await this.#result("failed", "Trace 写入失败", iteration, traceStartStep);
      }

      if (secondBusinessFailure) {
        return await this.#result("failed", "连续两次业务失败", iteration, traceStartStep);
      }
      if (feedback.category === "timeout") {
        return await this.#result("failed", "命令执行超时", iteration, traceStartStep);
      }
      if (feedback.category === "environment_error") {
        return await this.#result("failed", "执行环境错误", iteration, traceStartStep);
      }
      if (limitReached) {
        return await this.#result("max_steps", "达到最大步数", iteration, traceStartStep);
      }
      observations = [feedback.observation];
    }

    return await this.#result(
      "max_steps",
      "达到最大步数",
      this.#maxSteps,
      traceStartStep
    );
  }
}

function approvalFromPolicy(policy: TraceEntry["policy"]): TraceEntry["approval"] {
  return policy === "allow" ? "not_required" : policy === "ask" ? "required" : "denied";
}
