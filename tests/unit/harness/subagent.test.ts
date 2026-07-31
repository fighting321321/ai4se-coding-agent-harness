import { describe, expect, it, vi } from "vitest";

import {
  Redactor,
  SessionContext,
  SharedStepBudget,
  SubagentManager
} from "../../../packages/harness/src/index.js";

describe("SubagentManager", () => {
  it("创建独立短期上下文、限制工具并只返回脱敏限长摘要", async () => {
    const parent = new SessionContext();
    parent.beginTurn("parent secret context");
    const createChild = vi.fn(async (request) => {
      expect(request.session).not.toBe(parent);
      expect(request.session.snapshot().messages).toEqual([]);
      expect(request.allowedTools).toEqual(["read_file"]);
      return { status: "completed" as const, summary: `sk-fake-subagent ${"x".repeat(200)}`, steps: 2, trace: [] };
    });
    const manager = new SubagentManager({
      createChild,
      maxDepth: 2,
      maxStepsPerChild: 3,
      allowedTools: ["read_file", "load_skill"],
      redactor: new Redactor(["sk-fake-subagent"]),
      maxSummaryChars: 80
    });

    const result = await manager.delegate({
      task: "inspect",
      allowedTools: ["read_file"]
    }, { depth: 0, budget: new SharedStepBudget(5) });

    expect(result).toMatchObject({ ok: true, value: { status: "completed", steps: 2 } });
    expect(JSON.stringify(result)).not.toContain("sk-fake-subagent");
    if (result.ok) expect(result.value.summary.length).toBeLessThanOrEqual(80);
  });

  it("确定性阻断深度、工具越权和共享预算不足", async () => {
    const createChild = vi.fn(async () => ({ status: "completed" as const, summary: "ok", steps: 1, trace: [] }));
    const manager = new SubagentManager({
      createChild,
      maxDepth: 1,
      maxStepsPerChild: 2,
      allowedTools: ["read_file"]
    });

    await expect(manager.delegate({ task: "nested", allowedTools: ["read_file"] }, { depth: 1, budget: new SharedStepBudget(5) })).resolves.toMatchObject({ ok: false, error: { code: "SUBAGENT_DEPTH_EXCEEDED" } });
    await expect(manager.delegate({ task: "write", allowedTools: ["write_file"] }, { depth: 0, budget: new SharedStepBudget(5) })).resolves.toMatchObject({ ok: false, error: { code: "SUBAGENT_TOOL_DENIED" } });
    await expect(manager.delegate({ task: "budget", allowedTools: ["read_file"] }, { depth: 0, budget: new SharedStepBudget(0) })).resolves.toMatchObject({ ok: false, error: { code: "SUBAGENT_BUDGET_EXHAUSTED" } });
    expect(createChild).not.toHaveBeenCalled();
  });
});
