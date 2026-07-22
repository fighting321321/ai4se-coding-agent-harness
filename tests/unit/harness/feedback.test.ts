import { describe, expect, it } from "vitest";

import {
  Redactor,
  classifyFeedback,
  type DispatchResult
} from "../../../packages/harness/src/index.js";

describe("classifyFeedback", () => {
  it("把成功命令的零退出码归类为 pass", () => {
    const result: DispatchResult = {
      ok: true,
      value: { ok: true, value: { exitCode: 0, stdout: "ok", stderr: "", truncated: false } }
    };

    expect(classifyFeedback(result, new Redactor())).toEqual({
      category: "pass",
      observation: "pass: command exited 0"
    });
  });

  it("把成功的文本工具结果脱敏后写入 pass observation", () => {
    const secret = "sk-fake-read-key";
    const result: DispatchResult = {
      ok: true,
      value: { ok: true, value: `Coding Agent Harness ${secret}` }
    };

    expect(classifyFeedback(result, new Redactor([secret]))).toEqual({
      category: "pass",
      observation: "pass: tool completed: Coding Agent Harness [REDACTED]"
    });
  });

  it("把非零退出码和脱敏输出摘要归类为业务 fail", () => {
    const secret = "sk-fake-command-key";
    const result: DispatchResult = {
      ok: true,
      value: {
        ok: true,
        value: { exitCode: 7, stdout: "fallback", stderr: `failed ${secret}`, truncated: false }
      }
    };

    expect(classifyFeedback(result, new Redactor([secret]))).toEqual({
      category: "fail",
      observation: "fail: command exited 7: failed [REDACTED] | fallback"
    });
  });

  it("把 COMMAND_TIMEOUT 归类为 timeout", () => {
    const result: DispatchResult = {
      ok: true,
      value: { ok: false, error: { code: "COMMAND_TIMEOUT", message: "timeout" } }
    };

    expect(classifyFeedback(result, new Redactor())).toEqual({
      category: "timeout",
      observation: "timeout: COMMAND_TIMEOUT"
    });
  });

  it("把 Dispatcher 和工具环境错误归类为 environment_error", () => {
    const result: DispatchResult = {
      ok: false,
      error: { code: "TOOL_EXECUTION_FAILED", message: "internal failure" }
    };

    expect(classifyFeedback(result, new Redactor())).toEqual({
      category: "environment_error",
      observation: "environment_error: TOOL_EXECUTION_FAILED"
    });
  });

  it("脱敏并稳定截断嵌套结构化错误的 observation", () => {
    const secret = "sk-fake-feedback-key";
    const diagnostic = `诊断 ${secret} ${"x".repeat(500)}`;
    const result: DispatchResult = {
      ok: true,
      value: {
        ok: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message: diagnostic
        }
      }
    };

    const feedback = classifyFeedback(result, new Redactor([secret]));

    expect(feedback.category).toBe("environment_error");
    expect(feedback.observation).toContain("[REDACTED]");
    expect(feedback.observation).not.toContain(secret);
    expect(feedback.observation).not.toContain(diagnostic);
    expect(feedback.observation.length).toBeLessThanOrEqual(160);
    expect(feedback.observation.length).toBe(160);
  });
});
