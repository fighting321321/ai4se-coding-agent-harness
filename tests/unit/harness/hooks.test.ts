import { describe, expect, it, vi } from "vitest";

import {
  HookManager,
  type LifecycleHook
} from "../../../packages/harness/src/index.js";

describe("HookManager", () => {
  it("按注册顺序且每个会话只运行一次 SessionStart/SessionEnd", async () => {
    const calls: string[] = [];
    const hook = (name: string): LifecycleHook => ({
      name,
      sessionStart: () => { calls.push(`${name}:start`); },
      sessionEnd: () => { calls.push(`${name}:end`); }
    });
    const manager = new HookManager({ hooks: [hook("one"), hook("two")], sessionId: "s-1" });

    await manager.start();
    await manager.start();
    await manager.end("exit");
    await manager.end("eof");

    expect(calls).toEqual(["one:start", "two:start", "one:end", "two:end"]);
  });

  it("PreToolUse 可在副作用前阻断且不冒充 Policy/Approval", async () => {
    const sideEffect = vi.fn();
    const manager = new HookManager({
      hooks: [{
        name: "workspace-freeze",
        preToolUse: () => ({ block: true, reason: "maintenance" })
      }],
      sessionId: "s-2"
    });

    const result = await manager.aroundTool(
      { type: "write_file", path: "result.txt", content: "value" },
      sideEffect
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "HOOK_BLOCKED", message: "工具调用被生命周期 Hook 阻断" }
    });
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it("Hook 异常和 PostToolUse 输入均被脱敏为固定结果", async () => {
    const seen: unknown[] = [];
    const manager = new HookManager({
      hooks: [{
        name: "audit",
        postToolUse: (event) => { seen.push(event.result); }
      }, {
        name: "broken",
        postToolUse: () => { throw new Error("sk-hook-secret"); }
      }],
      redactorValues: ["sk-hook-secret"],
      sessionId: "s-3"
    });

    const result = await manager.aroundTool(
      { type: "read_file", path: "README.md" },
      () => ({ token: "sk-hook-secret" })
    );

    expect(seen).toEqual([{ token: "[REDACTED]" }]);
    expect(result).toEqual({
      ok: false,
      error: { code: "HOOK_FAILED", message: "生命周期 Hook 执行失败" }
    });
    expect(JSON.stringify(result)).not.toContain("sk-hook-secret");
  });
});
