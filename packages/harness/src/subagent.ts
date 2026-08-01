import { randomUUID } from "node:crypto";

import type { Action } from "./action.js";
import type { RunResult, RunStatus } from "./agent-loop.js";
import { Redactor } from "./redactor.js";
import { SessionContext } from "./session-context.js";

export type DelegatedTool = Exclude<Action["type"], "delegate_agent" | "finish">;

export interface DelegateAgentRequest {
  readonly task: string;
  readonly allowedTools: readonly DelegatedTool[];
}

export class SharedStepBudget {
  readonly #total: number;
  #used = 0;

  constructor(total: number) {
    if (!Number.isInteger(total) || total < 0) throw new Error("共享步骤预算必须是非负整数");
    this.#total = total;
  }

  get remaining(): number { return this.#total - this.#used; }
  get used(): number { return this.#used; }

  consume(): boolean {
    if (this.remaining < 1) return false;
    this.#used += 1;
    return true;
  }

  charge(count: number): boolean {
    if (!Number.isInteger(count) || count < 0 || this.remaining < count) return false;
    this.#used += count;
    return true;
  }
}

export interface ChildAgentRequest extends DelegateAgentRequest {
  readonly depth: number;
  readonly maxSteps: number;
  readonly budget: SharedStepBudget;
  readonly session: SessionContext;
  readonly childId: string;
}

export type ChildAgentFactory = (request: ChildAgentRequest) => Promise<RunResult>;

export interface SubagentSummary {
  readonly childId: string;
  readonly status: RunStatus;
  readonly summary: string;
  readonly steps: number;
}

export type SubagentResult =
  | { readonly ok: true; readonly value: SubagentSummary }
  | { readonly ok: false; readonly error: { readonly code: "SUBAGENT_DEPTH_EXCEEDED" | "SUBAGENT_TOOL_DENIED" | "SUBAGENT_BUDGET_EXHAUSTED" | "SUBAGENT_FAILED"; readonly message: string } };

export interface SubagentManagerOptions {
  readonly createChild: ChildAgentFactory;
  readonly maxDepth?: number;
  readonly maxStepsPerChild?: number;
  readonly allowedTools?: readonly DelegatedTool[];
  readonly redactor?: Redactor;
  readonly maxSummaryChars?: number;
}

function bounded(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 12))}[TRUNCATED]`;
}

export class SubagentManager {
  readonly #createChild: ChildAgentFactory;
  readonly #maxDepth: number;
  readonly #maxStepsPerChild: number;
  readonly #allowedTools: ReadonlySet<DelegatedTool>;
  readonly #redactor: Redactor;
  readonly #maxSummaryChars: number;

  constructor(options: SubagentManagerOptions) {
    this.#createChild = options.createChild;
    this.#maxDepth = options.maxDepth ?? 1;
    this.#maxStepsPerChild = options.maxStepsPerChild ?? 4;
    this.#allowedTools = new Set(options.allowedTools ?? ["read_file", "load_skill"]);
    this.#redactor = options.redactor ?? new Redactor();
    this.#maxSummaryChars = options.maxSummaryChars ?? 512;
    if (!Number.isInteger(this.#maxDepth) || this.#maxDepth < 1 ||
        !Number.isInteger(this.#maxStepsPerChild) || this.#maxStepsPerChild < 1 ||
        !Number.isInteger(this.#maxSummaryChars) || this.#maxSummaryChars < 32) {
      throw new Error("Subagent 限制必须为有效正整数");
    }
  }

  async delegate(request: DelegateAgentRequest, runtime: { readonly depth: number; readonly budget: SharedStepBudget }): Promise<SubagentResult> {
    if (runtime.depth >= this.#maxDepth) {
      return { ok: false, error: { code: "SUBAGENT_DEPTH_EXCEEDED", message: "子 Agent 已达到最大委派深度" } };
    }
    if (request.allowedTools.some((tool) => !this.#allowedTools.has(tool))) {
      return { ok: false, error: { code: "SUBAGENT_TOOL_DENIED", message: "子 Agent 请求了未授权工具" } };
    }
    if (runtime.budget.remaining < 1) {
      return { ok: false, error: { code: "SUBAGENT_BUDGET_EXHAUSTED", message: "父子共享步骤预算已耗尽" } };
    }
    try {
      const childId = randomUUID();
      const usedBefore = runtime.budget.used;
      const result = await this.#createChild({
        task: this.#redactor.redactText(request.task),
        allowedTools: Object.freeze([...request.allowedTools]),
        depth: runtime.depth + 1,
        maxSteps: Math.min(this.#maxStepsPerChild, runtime.budget.remaining),
        budget: runtime.budget,
        session: new SessionContext({ redactor: this.#redactor }),
        childId
      });
      const uncharged = Math.max(0, result.steps - (runtime.budget.used - usedBefore));
      if (!runtime.budget.charge(uncharged)) {
        return { ok: false, error: { code: "SUBAGENT_BUDGET_EXHAUSTED", message: "父子共享步骤预算已耗尽" } };
      }
      return { ok: true, value: Object.freeze({
        childId,
        status: result.status,
        summary: bounded(this.#redactor.redactText(result.summary), this.#maxSummaryChars),
        steps: result.steps
      }) };
    } catch {
      return { ok: false, error: { code: "SUBAGENT_FAILED", message: "子 Agent 执行失败" } };
    }
  }
}
