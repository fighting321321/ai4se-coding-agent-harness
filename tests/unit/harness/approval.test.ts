import { describe, expect, it, vi } from "vitest";

import {
  ApprovalGate,
  Dispatcher,
  PolicyEngine
} from "../../../packages/harness/src/index.js";

const writeAction = { type: "write_file", path: "notes.txt", content: "内容" } as const;

describe("ApprovalGate", () => {
  it("ask 只询问一次，明确同意后才调用 handler", async () => {
    const approve = vi.fn(async () => true);
    const handler = vi.fn(async () => "已写入");
    const gate = new ApprovalGate(approve);

    await expect(gate.execute("ask", { action: writeAction }, handler)).resolves.toEqual({
      ok: true,
      value: "已写入"
    });
    expect(approve).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(approve.mock.invocationCallOrder[0]).toBeLessThan(handler.mock.invocationCallOrder[0] ?? 0);
  });

  it.each([
    { name: "缺少批准器", approve: undefined, code: "APPROVAL_REQUIRED" },
    { name: "拒绝批准", approve: async () => false, code: "APPROVAL_DENIED" },
    {
      name: "批准器异常",
      approve: async () => {
        throw new Error("内部确认错误");
      },
      code: "APPROVAL_FAILED"
    }
  ])("$name 时 handler 调用次数为零", async ({ approve, code }) => {
    const handler = vi.fn();
    const gate = new ApprovalGate(approve);

    await expect(gate.execute("ask", { action: writeAction }, handler)).resolves.toMatchObject({
      ok: false,
      error: { code }
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Dispatcher 治理集成", () => {
  it("deny 在 handler 之前返回稳定错误", async () => {
    const handler = vi.fn();
    const dispatcher = new Dispatcher({
      policy: new PolicyEngine({ allowedCommands: [] })
    });
    dispatcher.register("run_command", handler);

    await expect(
      dispatcher.execute({ type: "run_command", executable: "cmd.exe", args: ["/c", "dir"] })
    ).resolves.toMatchObject({ ok: false, error: { code: "POLICY_DENIED" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("未批准写入不会调用 handler", async () => {
    const handler = vi.fn();
    const dispatcher = new Dispatcher({
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(async () => false)
    });
    dispatcher.register("write_file", handler);

    await expect(dispatcher.execute(writeAction)).resolves.toMatchObject({
      ok: false,
      error: { code: "APPROVAL_DENIED" }
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("未知工具不会触发批准器或任意 handler", async () => {
    const approve = vi.fn(async () => true);
    const handler = vi.fn();
    const dispatcher = new Dispatcher({
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(approve)
    });
    dispatcher.register("read_file", handler);

    await expect(dispatcher.execute(writeAction)).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_UNKNOWN" }
    });
    expect(approve).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
