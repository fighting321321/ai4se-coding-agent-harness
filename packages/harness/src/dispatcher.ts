import type { Action } from "./action.js";
import {
  ApprovalGate,
  type ApprovalErrorCode,
  type ApprovalResult
} from "./approval.js";
import type { PolicyEngine } from "./policy.js";

type ActionType = Action["type"];
type ActionOfType<Type extends ActionType> = Extract<Action, { type: Type }>;
type ActionHandler<Type extends ActionType> = (
  action: ActionOfType<Type>
) => unknown | Promise<unknown>;
type StoredActionHandler = (action: Action) => unknown | Promise<unknown>;

export interface DispatcherOptions {
  policy?: PolicyEngine;
  approval?: ApprovalGate;
}

export type DispatchResult =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: {
        code: "TOOL_UNKNOWN" | "TOOL_EXECUTION_FAILED" | ApprovalErrorCode;
        message: string;
      };
    };

export class Dispatcher {
  readonly #handlers = new Map<ActionType, StoredActionHandler>();
  readonly #policy: PolicyEngine | undefined;
  readonly #approval: ApprovalGate;

  constructor(options: DispatcherOptions = {}) {
    this.#policy = options.policy;
    this.#approval = options.approval ?? new ApprovalGate();
  }

  register<Type extends ActionType>(type: Type, handler: ActionHandler<Type>): void {
    if (this.#handlers.has(type)) {
      throw new Error(`动作 ${type} 已注册 handler`);
    }

    this.#handlers.set(type, handler as unknown as StoredActionHandler);
  }

  async execute(action: Action): Promise<DispatchResult> {
    const handler = this.#handlers.get(action.type);
    if (handler === undefined) {
      return {
        ok: false,
        error: {
          code: "TOOL_UNKNOWN",
          message: `没有为动作 ${action.type} 注册 handler`
        }
      };
    }

    try {
      if (this.#policy === undefined) {
        return { ok: true, value: await handler(action) };
      }

      const result: ApprovalResult<unknown> = await this.#approval.execute(
        this.#policy.evaluate(action),
        { action },
        () => handler(action)
      );
      return result;
    } catch {
      return {
        ok: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message: `动作 ${action.type} 的 handler 执行失败`
        }
      };
    }
  }
}
