import { describe, expect, it, vi } from "vitest";

import {
  FeedbackSensorSuite,
  Redactor,
  type SensorExecutor
} from "../../../packages/harness/src/index.js";

describe("FeedbackSensorSuite", () => {
  it("按配置顺序使用结构化 executable/args 并返回脱敏限长结果", async () => {
    const execute = vi.fn<SensorExecutor>(async (_executable, args) => ({
      ok: true,
      value: {
        exitCode: args[0] === "test" ? 0 : 1,
        stdout: `sk-fake-sensor-key ${"x".repeat(100)}`,
        stderr: "",
        truncated: false
      }
    }));
    const suite = new FeedbackSensorSuite({
      sensors: [
        { name: "test", executable: "safe-tool", args: ["test"] },
        { name: "lint", executable: "safe-tool", args: ["lint"] }
      ],
      execute,
      maxObservationChars: 64,
      redactor: new Redactor(["sk-fake-sensor-key"])
    });

    const result = await suite.run();

    expect(execute.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ["safe-tool", ["test"]],
      ["safe-tool", ["lint"]]
    ]);
    expect(result.map((item) => item.category)).toEqual(["pass", "fail"]);
    expect(JSON.stringify(result)).not.toContain("sk-fake-sensor-key");
    expect(result.every((item) => item.observation.length <= 64)).toBe(true);
  });

  it("稳定分类 timeout、environment_error 和输出截断", async () => {
    const responses = [
      { ok: false as const, error: { code: "COMMAND_TIMEOUT" as const, message: "timeout" } },
      { ok: false as const, error: { code: "COMMAND_EXECUTION_FAILED" as const, message: "boom" } },
      { ok: true as const, value: { exitCode: 0, stdout: "ok", stderr: "", truncated: true } }
    ];
    const suite = new FeedbackSensorSuite({
      sensors: ["test", "lint", "typecheck"].map((name) => ({ name, executable: "safe", args: [name] })),
      execute: async () => responses.shift()!,
      redactor: new Redactor()
    });

    const result = await suite.run();

    expect(result.map((item) => item.category)).toEqual(["timeout", "environment_error", "pass"]);
    expect(result[2]).toMatchObject({ truncated: true });
  });

  it("拒绝 Shell、重复名称和非结构化参数", () => {
    const execute: SensorExecutor = async () => ({ ok: true, value: { exitCode: 0, stdout: "", stderr: "", truncated: false } });
    expect(() => new FeedbackSensorSuite({ sensors: [{ name: "test", executable: "powershell", args: ["-Command", "echo hi"] }], execute })).toThrow();
    expect(() => new FeedbackSensorSuite({ sensors: [{ name: "test", executable: "safe", args: ["a\0b"] }], execute })).toThrow();
    expect(() => new FeedbackSensorSuite({ sensors: [
      { name: "test", executable: "safe", args: ["test"] },
      { name: "test", executable: "safe", args: ["test"] }
    ], execute })).toThrow();
  });
});
