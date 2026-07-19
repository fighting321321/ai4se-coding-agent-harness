import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AgentLoop,
  ApprovalGate,
  Dispatcher,
  JsonMemory,
  JsonTrace,
  PolicyEngine,
  Redactor,
  ScriptedMockLLM
} from "../../../packages/harness/src/index.js";

interface HarnessOptions {
  readonly approval?: ApprovalGate;
  readonly maxSteps?: number;
  readonly runCommand?: () => unknown | Promise<unknown>;
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
  const dispatcher = new Dispatcher({ policy, approval: options.approval });
  dispatcher.register("read_file", (action) => `read:${action.path}`);
  dispatcher.register("write_file", () => "written");
  dispatcher.register("run_command", () =>
    options.runCommand?.() ?? {
      ok: true,
      value: { exitCode: 0, stdout: "", stderr: "", truncated: false }
    }
  );
  dispatcher.register("finish", (action) => action.summary);
  const provider = new ScriptedMockLLM(script);

  return {
    loop: new AgentLoop({
      provider,
      memory,
      dispatcher,
      trace,
      policy,
      maxSteps: options.maxSteps
    }),
    memory,
    memoryPath,
    provider,
    trace,
    tracePath
  };
}

describe("AgentLoop", () => {
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
    expect(harness.provider.calls).toHaveLength(3);
    expect(harness.provider.calls[0]?.context).toEqual(["repair tests without network"]);
    expect(harness.provider.calls[1]?.observations).toEqual(["fail: command exited 1"]);
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
    expect(harness.provider.calls).toHaveLength(2);
    expect(result.trace.at(-1)).toMatchObject({ status: "failed" });
  });

  it("finish 在不执行额外工具后完成", async () => {
    const harness = await createHarness([{ raw: { type: "finish", summary: "done" } }]);

    const result = await harness.loop.run("finish now");

    expect(result).toMatchObject({ status: "completed", summary: "done", steps: 1 });
    expect(harness.provider.calls).toHaveLength(1);
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
    expect(deniedResult.trace[0]).toMatchObject({ policy: "deny", status: "blocked" });
    expect(approvalResult.trace[0]).toMatchObject({ policy: "ask", status: "blocked" });
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
    expect(result.trace.at(-1)).toMatchObject({ stopReason: "max_steps" });
  });

  it("解析、Provider、Memory、Trace 和环境错误均返回 failed", async () => {
    const parseFailure = await createHarness([{ raw: { type: "unknown" } }]);
    const providerFailure = await createHarness([]);
    const memoryFailure = await createHarness([{ raw: { type: "finish", summary: "nope" } }]);
    const traceFailure = await createHarness([{ raw: { type: "finish", summary: "nope" } }]);
    const environmentFailure = await createHarness(
      [{ raw: { type: "run_command", executable: "safe-tool", args: ["run"] } }],
      {
        runCommand: () => ({
          ok: false,
          error: { code: "COMMAND_EXECUTION_FAILED", message: "environment unavailable" }
        })
      }
    );
    await writeFile(memoryFailure.memoryPath, "[]", "utf8");
    await writeFile(traceFailure.tracePath, "[]", "utf8");

    const parseResult = await parseFailure.loop.run("parse failure");
    const providerResult = await providerFailure.loop.run("provider failure");
    const memoryResult = await memoryFailure.loop.run("memory failure");
    const traceResult = await traceFailure.loop.run("trace failure");
    const environmentResult = await environmentFailure.loop.run("environment failure");

    expect(parseResult.status).toBe("failed");
    expect(providerResult.status).toBe("failed");
    expect(memoryResult.status).toBe("failed");
    expect(traceResult.status).toBe("failed");
    expect(environmentResult.status).toBe("failed");
  });
});
