import type { Action } from "./action.js";
import { Redactor } from "./redactor.js";

export type SessionEndReason = "exit" | "eof" | "new" | "error";
export type HookKind = "SessionStart" | "PreToolUse" | "PostToolUse" | "SessionEnd";

export interface SessionHookEvent {
  readonly sessionId: string;
}

export interface PreToolUseEvent extends SessionHookEvent {
  readonly action: Action;
}

export interface PostToolUseEvent extends PreToolUseEvent {
  readonly result: unknown;
}

export interface SessionEndEvent extends SessionHookEvent {
  readonly reason: SessionEndReason;
}

export interface HookDecision {
  readonly block?: boolean;
  readonly reason?: string;
}

export interface LifecycleHook {
  readonly name: string;
  readonly sessionStart?: (event: SessionHookEvent) => void | Promise<void>;
  readonly preToolUse?: (event: PreToolUseEvent) => HookDecision | void | Promise<HookDecision | void>;
  readonly postToolUse?: (event: PostToolUseEvent) => void | Promise<void>;
  readonly sessionEnd?: (event: SessionEndEvent) => void | Promise<void>;
}

export interface HookTraceEvent {
  readonly sessionId: string;
  readonly kind: HookKind;
  readonly hook: string;
  readonly status: "completed" | "blocked" | "failed";
  readonly actionType?: Action["type"];
  readonly reason?: string;
}

export type HookResult<Value = void> =
  | { readonly ok: true; readonly value: Value }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "HOOK_BLOCKED" | "HOOK_FAILED";
        readonly message: string;
      };
    };

export interface HookManagerOptions {
  readonly hooks?: readonly LifecycleHook[];
  readonly sessionId?: string;
  readonly redactor?: Redactor;
  readonly redactorValues?: readonly string[];
  readonly record?: (event: HookTraceEvent) => void | Promise<void>;
}

function failure(code: "HOOK_BLOCKED" | "HOOK_FAILED"): HookResult<never> {
  return {
    ok: false,
    error: {
      code,
      message: code === "HOOK_BLOCKED"
        ? "工具调用被生命周期 Hook 阻断"
        : "生命周期 Hook 执行失败"
    }
  };
}

function validHookName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(name);
}

export class HookManager {
  readonly #hooks: readonly LifecycleHook[];
  readonly #sessionId: string;
  readonly #redactor: Redactor;
  readonly #record: HookManagerOptions["record"];
  #started = false;
  #ended = false;

  constructor(options: HookManagerOptions = {}) {
    const names = new Set<string>();
    for (const hook of options.hooks ?? []) {
      if (!validHookName(hook.name) || names.has(hook.name)) {
        throw new Error("Hook 名称无效或重复");
      }
      names.add(hook.name);
    }
    this.#hooks = Object.freeze([...(options.hooks ?? [])]);
    this.#sessionId = options.sessionId ?? "session";
    this.#redactor = options.redactor ?? new Redactor(options.redactorValues);
    this.#record = options.record;
  }

  get sessionId(): string {
    return this.#sessionId;
  }

  async start(): Promise<HookResult> {
    if (this.#started) {
      return { ok: true, value: undefined };
    }
    this.#started = true;
    return await this.#runSimple("SessionStart", "sessionStart", { sessionId: this.#sessionId });
  }

  async end(reason: SessionEndReason): Promise<HookResult> {
    if (this.#ended) {
      return { ok: true, value: undefined };
    }
    this.#ended = true;
    return await this.#runSimple("SessionEnd", "sessionEnd", {
      sessionId: this.#sessionId,
      reason
    });
  }

  async aroundTool<Value>(action: Action, execute: () => Value | Promise<Value>): Promise<HookResult<Value>> {
    const safeAction = this.#redactor.redact(action);
    for (const hook of this.#hooks) {
      if (hook.preToolUse === undefined) {
        continue;
      }
      try {
        const decision = await hook.preToolUse({ sessionId: this.#sessionId, action: safeAction });
        if (decision?.block === true) {
          await this.#emit({
            sessionId: this.#sessionId,
            kind: "PreToolUse",
            hook: hook.name,
            status: "blocked",
            actionType: action.type,
            reason: this.#redactor.redactText(decision.reason ?? "blocked").slice(0, 160)
          });
          return failure("HOOK_BLOCKED");
        }
        await this.#emit({
          sessionId: this.#sessionId,
          kind: "PreToolUse",
          hook: hook.name,
          status: "completed",
          actionType: action.type
        });
      } catch {
        await this.#emit({
          sessionId: this.#sessionId,
          kind: "PreToolUse",
          hook: hook.name,
          status: "failed",
          actionType: action.type
        });
        return failure("HOOK_FAILED");
      }
    }

    const value = await execute();
    const safeResult = this.#redactor.redact(value);
    for (const hook of this.#hooks) {
      if (hook.postToolUse === undefined) {
        continue;
      }
      try {
        await hook.postToolUse({
          sessionId: this.#sessionId,
          action: safeAction,
          result: safeResult
        });
        await this.#emit({
          sessionId: this.#sessionId,
          kind: "PostToolUse",
          hook: hook.name,
          status: "completed",
          actionType: action.type
        });
      } catch {
        await this.#emit({
          sessionId: this.#sessionId,
          kind: "PostToolUse",
          hook: hook.name,
          status: "failed",
          actionType: action.type
        });
        return failure("HOOK_FAILED");
      }
    }
    return { ok: true, value };
  }

  async #runSimple(
    kind: "SessionStart" | "SessionEnd",
    method: "sessionStart" | "sessionEnd",
    event: SessionHookEvent | SessionEndEvent
  ): Promise<HookResult> {
    for (const hook of this.#hooks) {
      const handler = hook[method] as ((value: typeof event) => void | Promise<void>) | undefined;
      if (handler === undefined) {
        continue;
      }
      try {
        await handler(this.#redactor.redact(event));
        await this.#emit({
          sessionId: this.#sessionId,
          kind,
          hook: hook.name,
          status: "completed",
          ...(kind === "SessionEnd" && "reason" in event ? { reason: event.reason } : {})
        });
      } catch {
        await this.#emit({
          sessionId: this.#sessionId,
          kind,
          hook: hook.name,
          status: "failed",
          ...(kind === "SessionEnd" && "reason" in event ? { reason: event.reason } : {})
        });
        return failure("HOOK_FAILED");
      }
    }
    return { ok: true, value: undefined };
  }

  async #emit(event: HookTraceEvent): Promise<void> {
    try {
      await this.#record?.(this.#redactor.redact(event));
    } catch {
      // Trace/observer failure must not reveal the original error to hooks or callers.
    }
  }
}
