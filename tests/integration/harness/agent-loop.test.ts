import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  AgentLoop,
  ApprovalGate,
  Dispatcher,
  JsonMemory,
  JsonTrace,
  PolicyEngine,
  Redactor,
  SessionContext,
  ScriptedMockLLM
} from "../../../packages/harness/src/index.js";

interface HarnessOptions {
  readonly approval?: ApprovalGate;
  readonly maxSteps?: number;
  readonly runCommand?: () => unknown | Promise<unknown>;
  readonly session?: SessionContext;
}

async function createHarness(
  script: readonly { raw: unknown }[],
  options: HarnessOptions = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-agent-loop-"));
  const memoryPath = join(directory, "memory.json");
  const tracePath = join(directory, "trace.json");
  const redactor = new Redactor(["sk-fake-agent-key"]);
  const memory = new JsonMemory(memoryPath, redactor);
  const trace = new JsonTrace(tracePath, redactor);
  const policy = new PolicyEngine({
    allowedCommands: [{ executable: "safe-tool", args: ["run"] }]
  });
  const dispatcher = new Dispatcher();
  const handlerCalls = { readFile: 0, writeFile: 0, runCommand: 0 };
  dispatcher.register("read_file", (action) => {
    handlerCalls.readFile += 1;
    return `read:${action.path}`;
  });
  dispatcher.register("write_file", () => {
    handlerCalls.writeFile += 1;
    return "written";
  });
  dispatcher.register("run_command", () => {
    handlerCalls.runCommand += 1;
    return (
      options.runCommand?.() ?? {
        ok: true,
        value: { exitCode: 0, stdout: "", stderr: "", truncated: false }
      }
    );
  });
  dispatcher.register("finish", (action) => action.summary);
  const provider = new ScriptedMockLLM(script);

  return {
    loop: new AgentLoop({
      provider,
      memory,
      dispatcher,
      trace,
      policy,
      approval: options.approval,
      session: options.session,
      maxSteps: options.maxSteps
    }),
    handlerCalls,
    memory,
    memoryPath,
    provider,
    trace,
    tracePath
  };
}

describe("AgentLoop", () => {
  it("成功读取结果会回灌给下一轮 Provider 并允许 finish", async () => {
    const harness = await createHarness([
      { raw: { type: "read_file", path: "README.md" } },
      { raw: { type: "finish", summary: "已根据 README 完成总结" } }
    ]);

    const result = await harness.loop.run("先读取 README 再总结");

    expect(result).toMatchObject({
      status: "completed",
      summary: "已根据 README 完成总结",
      steps: 2
    });
    expect(harness.provider.calls[1]?.observations).toEqual([
      "pass: tool completed: read:README.md"
    ]);
    expect(result.trace[0]?.observation).toBe("pass: tool completed: read:README.md");
    expect(harness.provider.calls[1]?.messages?.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "action",
      "observation"
    ]);
  });

  it("同一 SessionContext 的后续任务会收到前一轮完整对话", async () => {
    const session = new SessionContext();
    const harness = await createHarness(
      [
        { raw: { type: "finish", summary: "第一题答案" }, assistantText: "回答第一题" },
        { raw: { type: "finish", summary: "引用第一题答案" }, assistantText: "回答第二题" }
      ],
      { session }
    );

    await harness.loop.run("第一题");
    const result = await harness.loop.run("第二题，请引用前文");

    expect(result.summary).toBe("引用第一题答案");
    expect(harness.provider.calls[1]?.messages).toEqual([
      { role: "user", content: "第一题" },
      { role: "assistant", content: "回答第一题" },
      { role: "action", action: { type: "finish", summary: "第一题答案" } },
      { role: "observation", content: "pass: finish" },
      { role: "user", content: "第二题，请引用前文" }
    ]);
  });

  it("首次业务失败后将脱敏反馈带入下一次调用，改用新动作并 finish", async () => {
    let commandCalls = 0;
    const harness = await createHarness(
      [
        { raw: { type: "run_command", executable: "safe-tool", args: ["run"] } },
        { raw: { type: "read_file", path: "README.md" } },
        { raw: { type: "finish", summary: "已修复 sk-fake-agent-key" } }
      ],
      {
        runCommand: () => {
          commandCalls += 1;
          return {
            ok: true,
            value: { exitCode: 1, stdout: "sk-fake-agent-key", stderr: "", truncated: false }
          };
        }
      }
    );
    await harness.memory.upsert({
      id: "test-convention",
      kind: "convention",
      tags: ["repair"],
      content: "repair tests without network",
      updatedAt: "2026-07-19T00:00:00.000Z"
    });

    const result = await harness.loop.run("repair tests");

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("已修复 [REDACTED]");
    expect(result.steps).toBe(3);
    expect(commandCalls).toBe(1);
    expect(harness.handlerCalls.runCommand).toBe(1);
    expect(harness.provider.calls).toHaveLength(3);
    expect(harness.provider.calls[0]?.context).toEqual(["repair tests without network"]);
    expect(harness.provider.calls[1]?.observations).toEqual([
      "fail: command exited 1: [REDACTED]"
    ]);
    expect(JSON.stringify(result.trace)).not.toContain("sk-fake-agent-key");
    expect(result.trace.map((entry) => entry.status)).toEqual([
      "running",
      "running",
      "completed"
    ]);
  });

  it("连续两次业务失败立即停止，不进行第三次 Provider 或工具调用", async () => {
    let commandCalls = 0;
    const harness = await createHarness(
      [
        { raw: { type: "run_command", executable: "safe-tool", args: ["run"] } },
        { raw: { type: "run_command", executable: "safe-tool", args: ["run"] } },
        { raw: { type: "finish", summary: "不应调用" } }
      ],
      {
        runCommand: () => {
          commandCalls += 1;
          return { ok: true, value: { exitCode: 2, stdout: "", stderr: "", truncated: false } };
        }
      }
    );

    const result = await harness.loop.run("retry once");

    expect(result.status).toBe("failed");
    expect(result.steps).toBe(2);
    expect(commandCalls).toBe(2);
    expect(harness.handlerCalls.runCommand).toBe(2);
    expect(harness.provider.calls).toHaveLength(2);
    expect(result.trace.at(-1)).toMatchObject({
      status: "failed",
      stopReason: "second_business_failure"
    });
  });

  it("finish 在不执行额外工具后完成", async () => {
    const harness = await createHarness([{ raw: { type: "finish", summary: "done" } }]);

    const result = await harness.loop.run("finish now");

    expect(result).toMatchObject({ status: "completed", summary: "done", steps: 1 });
    expect(harness.provider.calls).toHaveLength(1);
    expect(harness.handlerCalls).toEqual({ readFile: 0, writeFile: 0, runCommand: 0 });
    expect(result.trace[0]).toMatchObject({ policy: "allow", status: "completed" });
  });

  it("策略 deny 和缺少批准都会 blocked 且 handler 零调用", async () => {
    const denied = await createHarness([
      { raw: { type: "read_file", path: "../secret.txt" } }
    ]);
    const approvalRequired = await createHarness([
      { raw: { type: "write_file", path: "result.txt", content: "value" } }
    ]);

    const deniedResult = await denied.loop.run("read protected file");
    const approvalResult = await approvalRequired.loop.run("write result");

    expect(deniedResult).toMatchObject({ status: "blocked", steps: 1 });
    expect(approvalResult).toMatchObject({ status: "blocked", steps: 1 });
    expect(denied.handlerCalls).toEqual({ readFile: 0, writeFile: 0, runCommand: 0 });
    expect(approvalRequired.handlerCalls).toEqual({ readFile: 0, writeFile: 0, runCommand: 0 });
    expect(deniedResult.trace[0]).toMatchObject({ policy: "deny", status: "blocked" });
    expect(approvalResult.trace[0]).toMatchObject({ policy: "ask", status: "blocked" });
  });

  it("ask 动作仅在明确批准后执行一次", async () => {
    const approve = vi.fn(async () => true);
    const harness = await createHarness(
      [
        { raw: { type: "write_file", path: "result.txt", content: "value" } },
        { raw: { type: "finish", summary: "done" } }
      ],
      { approval: new ApprovalGate(approve) }
    );

    const result = await harness.loop.run("write result");

    expect(result).toMatchObject({ status: "completed", steps: 2 });
    expect(approve).toHaveBeenCalledTimes(1);
    expect(harness.handlerCalls.writeFile).toBe(1);
  });

  it("达到最大步数时返回 max_steps 并在 Trace 明确保留终止原因", async () => {
    const harness = await createHarness(
      [
        { raw: { type: "read_file", path: "one.txt" } },
        { raw: { type: "read_file", path: "two.txt" } },
        { raw: { type: "finish", summary: "不应调用" } }
      ],
      { maxSteps: 2 }
    );

    const result = await harness.loop.run("bounded task");

    expect(result).toMatchObject({ status: "max_steps", steps: 2 });
    expect(harness.provider.calls).toHaveLength(2);
    expect(harness.handlerCalls.readFile).toBe(2);
    expect(result.trace.at(-1)).toMatchObject({ stopReason: "max_steps" });
  });

  it("使用默认上限时恰好执行 8 轮，不请求第 9 个脚本动作", async () => {
    const harness = await createHarness([
      ...Array.from({ length: 8 }, (_, index) => ({
        raw: { type: "read_file", path: `file-${index + 1}.txt` }
      })),
      { raw: { type: "finish", summary: "不应请求" } }
    ]);

    const result = await harness.loop.run("default bounded task");

    expect(result).toMatchObject({ status: "max_steps", steps: 8 });
    expect(harness.provider.calls).toHaveLength(8);
    expect(harness.handlerCalls.readFile).toBe(8);
    expect(result.trace).toHaveLength(8);
    expect(result.trace.at(-1)).toMatchObject({ status: "failed", stopReason: "max_steps" });
  });

  it("解析错误在第一轮失败，不重试 Provider 或 handler", async () => {
    const harness = await createHarness([{ raw: { type: "unknown" } }]);

    const result = await harness.loop.run("parse failure");

    expect(result).toMatchObject({ status: "failed", steps: 1 });
    expect(harness.provider.calls).toHaveLength(1);
    expect(harness.handlerCalls).toEqual({ readFile: 0, writeFile: 0, runCommand: 0 });
    expect(result.trace).toEqual([
      expect.objectContaining({ status: "failed", stopReason: "parse_error" })
    ]);
  });

  it("Provider 错误在第一轮失败，不执行 handler", async () => {
    const harness = await createHarness([]);

    const result = await harness.loop.run("provider failure");

    expect(result).toMatchObject({ status: "failed", steps: 1 });
    expect(harness.provider.calls).toHaveLength(1);
    expect(harness.handlerCalls).toEqual({ readFile: 0, writeFile: 0, runCommand: 0 });
    expect(result.trace).toEqual([
      expect.objectContaining({ status: "failed", stopReason: "provider_error" })
    ]);
  });

  it("Memory 错误在 Provider 前失败，且不执行 handler", async () => {
    const harness = await createHarness([{ raw: { type: "finish", summary: "不应请求" } }]);
    await writeFile(harness.memoryPath, "[]", "utf8");

    const result = await harness.loop.run("memory failure");

    expect(result).toMatchObject({ status: "failed", steps: 1 });
    expect(harness.provider.calls).toHaveLength(0);
    expect(harness.handlerCalls).toEqual({ readFile: 0, writeFile: 0, runCommand: 0 });
    expect(result.trace).toEqual([
      expect.objectContaining({ status: "failed", stopReason: "memory_error" })
    ]);
  });

  it("Trace 存储损坏时返回空 Trace，不伪造失败条目", async () => {
    const harness = await createHarness([{ raw: { type: "finish", summary: "nope" } }]);
    await writeFile(harness.tracePath, "[]", "utf8");

    const result = await harness.loop.run("trace failure");

    expect(result).toMatchObject({ status: "failed", steps: 1, trace: [] });
    expect(harness.provider.calls).toHaveLength(0);
    expect(harness.handlerCalls).toEqual({ readFile: 0, writeFile: 0, runCommand: 0 });
  });

  it("保留已知 Provider 错误代码但不泄露异常正文", async () => {
    const harness = await createHarness([]);
    const provider = {
      complete: vi.fn(async () => {
        throw Object.assign(new Error("secret remote body"), {
          code: "PROVIDER_RATE_LIMITED"
        });
      })
    };
    const loop = new AgentLoop({
      provider,
      memory: harness.memory,
      dispatcher: new Dispatcher(),
      trace: harness.trace,
      policy: new PolicyEngine({ allowedCommands: [] })
    });

    const result = await loop.run("rate limited");

    expect(result.trace.at(-1)).toMatchObject({
      status: "failed",
      stopReason: "provider_rate_limited"
    });
    expect(JSON.stringify(result)).not.toContain("secret remote body");
  });

  it("同一 AgentLoop 可以连续运行并追加唯一 Trace step", async () => {
    const harness = await createHarness([
      { raw: { type: "finish", summary: "first" } },
      { raw: { type: "finish", summary: "second" } }
    ]);

    const first = await harness.loop.run("first task");
    const second = await harness.loop.run("second task");
    const persisted = await harness.trace.read();

    expect(first).toMatchObject({ status: "completed", summary: "first", steps: 1 });
    expect(second).toMatchObject({ status: "completed", summary: "second", steps: 1 });
    expect(first.trace.map((entry) => entry.step)).toEqual([1]);
    expect(second.trace.map((entry) => entry.step)).toEqual([2]);
    expect(persisted).toMatchObject({ ok: true });
    if (persisted.ok) {
      expect(persisted.value.map((entry) => entry.step)).toEqual([1, 2]);
    }
  });

  it("环境错误在第一轮失败，不重试 Provider 或命令 handler", async () => {
    const harness = await createHarness(
      [{ raw: { type: "run_command", executable: "safe-tool", args: ["run"] } }],
      {
        runCommand: () => ({
          ok: false,
          error: { code: "COMMAND_EXECUTION_FAILED", message: "environment unavailable" }
        })
      }
    );

    const result = await harness.loop.run("environment failure");

    expect(result).toMatchObject({ status: "failed", steps: 1 });
    expect(harness.provider.calls).toHaveLength(1);
    expect(harness.handlerCalls.runCommand).toBe(1);
    expect(result.trace).toEqual([
      expect.objectContaining({ status: "failed", stopReason: "environment_error" })
    ]);
  });

  it("COMMAND_TIMEOUT 在第一轮失败，不重试 Provider 或命令 handler", async () => {
    const harness = await createHarness(
      [{ raw: { type: "run_command", executable: "safe-tool", args: ["run"] } }],
      {
        runCommand: () => ({
          ok: false,
          error: { code: "COMMAND_TIMEOUT", message: "timeout" }
        })
      }
    );

    const result = await harness.loop.run("timeout failure");

    expect(result).toMatchObject({ status: "failed", steps: 1 });
    expect(harness.provider.calls).toHaveLength(1);
    expect(harness.handlerCalls.runCommand).toBe(1);
    expect(result.trace).toEqual([
      expect.objectContaining({ status: "failed", stopReason: "timeout" })
    ]);
  });
});
