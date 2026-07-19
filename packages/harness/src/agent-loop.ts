import { parseAction } from "./action-parser.js";
import type { Dispatcher } from "./dispatcher.js";
import { classifyFeedback } from "./feedback.js";
import type { JsonMemory } from "./json-memory.js";
import type { LLMProvider } from "./llm-provider.js";
import type { PolicyEngine } from "./policy.js";
import { Redactor } from "./redactor.js";
import type { JsonTrace, TraceEntry } from "./trace.js";

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
  dispatcher: Dispatcher;
  trace: JsonTrace;
  policy: PolicyEngine;
  maxSteps?: number;
}

const DEFAULT_MAX_STEPS = 8;

function taskKeywords(task: string): readonly string[] {
  return (task.match(/[\p{L}\p{N}_-]+/gu) ?? []).slice(0, 20);
}

function isApprovalBlock(code: string): boolean {
  return code === "POLICY_DENIED" || code === "APPROVAL_REQUIRED" || code === "APPROVAL_DENIED";
}

export class AgentLoop {
  readonly #provider: LLMProvider;
  readonly #memory: JsonMemory;
  readonly #dispatcher: Dispatcher;
  readonly #trace: JsonTrace;
  readonly #policy: PolicyEngine;
  readonly #maxSteps: number;
  readonly #redactor = new Redactor();

  constructor(options: AgentLoopOptions) {
    this.#provider = options.provider;
    this.#memory = options.memory;
    this.#dispatcher = options.dispatcher;
    this.#trace = options.trace;
    this.#policy = options.policy;
    this.#maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    if (!Number.isInteger(this.#maxSteps) || this.#maxSteps < 1) {
      throw new Error("maxSteps 必须是正整数");
    }
  }

  async #result(status: RunStatus, summary: string, steps: number): Promise<RunResult> {
    const current = await this.#trace.read();
    if (!current.ok) {
      return {
        status: "failed",
        summary: "Trace 读取失败",
        steps,
        trace: []
      };
    }
    return { status, summary, steps, trace: current.value };
  }

  async #append(entry: TraceEntry): Promise<boolean> {
    const appended = await this.#trace.append(entry);
    return appended.ok;
  }

  async run(task: string): Promise<RunResult> {
    let observations: readonly string[] = [];
    let businessFailures = 0;

    for (let step = 1; step <= this.#maxSteps; step += 1) {
      const memory = await this.#memory.search({ keywords: taskKeywords(task), limit: 5 });
      if (!memory.ok) {
        const appended = await this.#append({
          step,
          policy: "allow",
          observation: "environment_error: Memory search failed",
          status: "failed",
          stopReason: "memory_error"
        });
        return appended
          ? await this.#result("failed", "Memory 检索失败", step)
          : await this.#result("failed", "Trace 写入失败", step);
      }

      let output: { raw: unknown };
      try {
        output = await this.#provider.complete({
          task,
          context: memory.value.map((item) => item.content),
          observations
        });
      } catch {
        const appended = await this.#append({
          step,
          policy: "allow",
          observation: "environment_error: Provider failed",
          status: "failed",
          stopReason: "provider_error"
        });
        return appended
          ? await this.#result("failed", "Provider 调用失败", step)
          : await this.#result("failed", "Trace 写入失败", step);
      }

      const parsed = parseAction(output.raw);
      if (!parsed.ok) {
        const appended = await this.#append({
          step,
          policy: "allow",
          observation: "environment_error: Action parse failed",
          status: "failed",
          stopReason: "parse_error"
        });
        return appended
          ? await this.#result("failed", "Action 解析失败", step)
          : await this.#result("failed", "Trace 写入失败", step);
      }

      const action = parsed.value;
      const decision = this.#policy.evaluate(action);
      if (decision === "deny") {
        const appended = await this.#append({
          step,
          action,
          policy: decision,
          observation: "blocked: POLICY_DENIED",
          status: "blocked",
          stopReason: "policy_denied"
        });
        return appended
          ? await this.#result("blocked", "策略拒绝该动作", step)
          : await this.#result("failed", "Trace 写入失败", step);
      }

      if (action.type === "finish") {
        const appended = await this.#trace.append({
          step,
          action,
          policy: decision,
          observation: "pass: finish",
          status: "completed",
          stopReason: "finish"
        });
        if (!appended.ok) {
          return await this.#result("failed", "Trace 写入失败", step);
        }
        const summary =
          appended.value.action?.type === "finish" ? appended.value.action.summary : action.summary;
        return await this.#result("completed", summary, step);
      }

      const dispatched = await this.#dispatcher.execute(action);
      if (!dispatched.ok && isApprovalBlock(dispatched.error.code)) {
        const appended = await this.#append({
          step,
          action,
          policy: decision,
          observation: `blocked: ${dispatched.error.code}`,
          status: "blocked",
          stopReason: dispatched.error.code
        });
        return appended
          ? await this.#result("blocked", "动作未获批准", step)
          : await this.#result("failed", "Trace 写入失败", step);
      }

      const feedback = classifyFeedback(dispatched, this.#redactor);
      if (feedback.category === "fail") {
        businessFailures += 1;
      }

      const secondBusinessFailure = businessFailures >= 2;
      const limitReached = step === this.#maxSteps;
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
        ...(stopReason === undefined ? {} : { stopReason })
      });
      if (!appended) {
        return await this.#result("failed", "Trace 写入失败", step);
      }

      if (secondBusinessFailure) {
        return await this.#result("failed", "连续两次业务失败", step);
      }
      if (feedback.category === "timeout") {
        return await this.#result("failed", "命令执行超时", step);
      }
      if (feedback.category === "environment_error") {
        return await this.#result("failed", "执行环境错误", step);
      }
      if (limitReached) {
        return await this.#result("max_steps", "达到最大步数", step);
      }
      observations = feedback.category === "fail" ? [feedback.observation] : [];
    }

    return await this.#result("max_steps", "达到最大步数", this.#maxSteps);
  }
}
