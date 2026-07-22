import { describe, expect, it } from "vitest";

import { Dispatcher, type Action } from "../../../packages/harness/src/index.js";

describe("Dispatcher", () => {
  it("每次 execute 只调用一次匹配的 handler", async () => {
    const dispatcher = new Dispatcher();
    const action: Action = { type: "read_file", path: "README.md" };
    let callCount = 0;
    let received: Action | undefined;
    dispatcher.register("read_file", async (current) => {
      callCount += 1;
      received = current;
      return "文件内容";
    });

    await expect(dispatcher.execute(action)).resolves.toEqual({
      ok: true,
      value: "文件内容"
    });
    expect(callCount).toBe(1);
    expect(received).toEqual(action);
  });

  it("没有注册匹配 handler 时返回 TOOL_UNKNOWN", async () => {
    const dispatcher = new Dispatcher();

    await expect(
      dispatcher.execute({ type: "finish", summary: "没有 finish handler" })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "TOOL_UNKNOWN",
        message: "没有为动作 finish 注册 handler"
      }
    });
  });

  it("handler 异常转换为 TOOL_EXECUTION_FAILED", async () => {
    const dispatcher = new Dispatcher();
    dispatcher.register("run_command", () => {
      throw new Error("不应泄漏的内部错误");
    });

    await expect(
      dispatcher.execute({ type: "run_command", executable: "pnpm", args: ["test"] })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "TOOL_EXECUTION_FAILED",
        message: "动作 run_command 的 handler 执行失败"
      }
    });
  });

  it("拒绝为同一动作类型重复注册 handler", () => {
    const dispatcher = new Dispatcher();
    dispatcher.register("write_file", () => undefined);

    expect(() => dispatcher.register("write_file", () => undefined)).toThrow(
      "动作 write_file 已注册 handler"
    );
  });
});
