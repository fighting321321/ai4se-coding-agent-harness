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
  HookManager,
  MemoryLifecycle,
  PolicyEngine,
  Redactor,
  SessionContext,
  ScriptedMockLLM,
  type LLMOutput
} from "../../../packages/harness/src/index.js";

interface HarnessOptions {
  readonly approval?: ApprovalGate;
  readonly maxSteps?: number;
  readonly runCommand?: () => unknown | Promise<unknown>;
  readonly readFile?: (path: string) => unknown | Promise<unknown>;
  readonly session?: SessionContext;
  readonly createHooks?: (trace: JsonTrace) => HookManager;
}

async function createHarness(
  script: readonly LLMOutput[],
  options: HarnessOptions = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-agent-loop-"));
  const memoryPath = join(directory, "memory.json");
  const tracePath = join(directory, "trace.json");
  const redactor = new Redactor(["sk-fake-agent-key"]);
  const memory = new JsonMemory(memoryPath, redactor);
  const memoryLifecycle = new MemoryLifecycle({
    memory,
    redactor,
    now: () => new Date("2026-07-29T09:00:00.000Z")
  });
  const trace = new JsonTrace(tracePath, redactor);
  const policy = new PolicyEngine({
    allowedCommands: [{ executable: "safe-tool", args: ["run"] }]
  });
  const dispatcher = new Dispatcher();
  const handlerCalls = { readFile: 0, writeFile: 0, runCommand: 0 };
  dispatcher.register("read_file", (action) => {
    handlerCalls.readFile += 1;
    return options.readFile?.(action.path) ?? `read:${action.path}`;
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
      memoryLifecycle,
      dispatcher,
      trace,
      policy,
      approval: options.approval,
      session: options.session,
      hooks: options.createHooks?.(trace),
      redactor,
      maxSteps: options.maxSteps
    }),
    handlerCalls,
    memory,
    memoryLifecycle,
    memoryPath,
    provider,
    trace,
    tracePath
  };
}

describe("AgentLoop", () => {
  it("完整 Trace 串联会话、模型摘要、审批、Hook、Memory 与停止原因", async () => {
    const harness = await createHarness(
      [
        { raw: { type: "write_file", path: "result.txt", content: "safe" }, assistantText: "准备写入结果" },
        { raw: { type: "finish", summary: "写入完成" }, assistantText: "任务结束" }
      ],
      {
        approval: new ApprovalGate(async () => true),
        createHooks: (trace) => new HookManager({
          sessionId: "session-replay",
          hooks: [{ name: "audit", preToolUse: () => undefined, postToolUse: () => undefined }],
          record: async (event) => { await trace.appendHookEvent(event); }
        })
      }
    );
    await harness.memory.upsert({
      id: "write-rule",
      kind: "convention",
      tags: ["write"],
      content: "写入后验证",
      updatedAt: "2026-07-31T00:00:00.000Z"
    });

    const result = await harness.loop.run("write result");
    const replay = await harness.trace.replay();

    expect(result).toMatchObject({ status: "completed", summary: "写入完成" });
    expect(replay).toMatchObject({
      ok: true,
      value: {
        version: 3,
        entries: [
          {
            sessionId: "session-replay",
            userInputSummary: "write result",
            assistantOutputSummary: "准备写入结果",
            approval: "approved",
            policy: "ask"
          },
          {
            sessionId: "session-replay",
            assistantOutputSummary: "任务结束",
            stopReason: "finish"
          }
        ],
        hookEvents: [
          { kind: "PreToolUse", status: "completed" },
          { kind: "PostToolUse", status: "completed" }
        ]
      }
    });
    expect(result.trace[0]?.details).toContainEqual({ type: "memory", phase: "retrieved", count: 1 });
    expect(result.trace[1]?.details).toContainEqual({ type: "memory", phase: "candidate_collected", count: 1 });
  });

  it("每项任务仅在首次 Provider 调用前检索一次，并在完成后收集安全候选", async () => {
    const harness = await createHarness([
      { raw: { type: "read_file", path: "README.md" } },
      { raw: { type: "finish", summary: "Vitest 检查完成" } }
    ]);
    await harness.memory.upsert({
      id: "vitest-convention",
      kind: "convention",
      tags: ["vitest"],
      content: "测试使用 Vitest",
      updatedAt: "2026-07-29T08:00:00.000Z"
    });
    const search = vi.spyOn(harness.memory, "search");

    const result = await harness.loop.run("检查 Vitest 配置");

    expect(result.status).toBe("completed");
    expect(search).toHaveBeenCalledTimes(1);
    expect(harness.provider.calls[0]?.context).toEqual(["测试使用 Vitest"]);
    expect(harness.provider.calls[1]?.context).toEqual(["测试使用 Vitest"]);
    expect(harness.memoryLifecycle.pending()).toEqual([
      expect.objectContaining({ kind: "recent_result", content: "Vitest 检查完成" })
    ]);
  });

  it("失败或阻断的任务不会生成 recent_result", async () => {
    const harness = await createHarness([
      { raw: { type: "read_file", path: "../secret.txt" } }
    ]);

    await harness.loop.run("读取越界文件");

    expect(harness.memoryLifecycle.pending()).toEqual([]);
  });

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

  it("连续重复读取同一文件时不再次执行工具，并提示 Provider 使用已有 Observation", async () => {
    const harness = await createHarness([
      { raw: { type: "read_file", path: "README.md" } },
      { raw: { type: "read_file", path: "README.md" } },
      { raw: { type: "finish", summary: "已使用首次读取结果完成总结" } }
    ]);

    const result = await harness.loop.run("读取 README 后总结");

    expect(result).toMatchObject({
      status: "completed",
      summary: "已使用首次读取结果完成总结",
      steps: 3
    });
    expect(harness.handlerCalls.readFile).toBe(1);
    expect(harness.provider.calls[2]?.observations).toEqual([
      "fail: duplicate read_file; use the previous Observation or read a different file"
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

  it("上下文压缩后仍保留近期 Action/Observation 并继续调用工具直至 finish", async () => {
    const session = new SessionContext({ maxContextChars: 260, recentMessageCount: 2 });
    const harness = await createHarness(
      [
        { raw: { type: "read_file", path: "one.txt" }, assistantText: "先读取第一个文件" },
        { raw: { type: "read_file", path: "two.txt" }, assistantText: "再读取第二个文件" },
        { raw: { type: "finish", summary: "压缩后完成" }, assistantText: "完成" }
      ],
      { session }
    );

    const result = await harness.loop.run("读取两个文件并总结");

    expect(result).toMatchObject({ status: "completed", summary: "压缩后完成", steps: 3 });
    expect(harness.handlerCalls.readFile).toBe(2);
    expect(harness.provider.calls[1]?.summary).not.toBe("");
    expect(harness.provider.calls[1]?.messages?.map((message) => message.role)).toEqual([
      "action",
      "observation"
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

  it("凭据管理源码可以通过审批写入，不会被敏感动作规则误报", async () => {
    const credentialSource = [
      "interface Options { apiKey: string }",
      "const apiKey = credential.value;",
      "await readSecret(\"API Key\");"
    ].join("\n");
    const harness = await createHarness(
      [
        { raw: { type: "write_file", path: "cli.ts", content: credentialSource } },
        { raw: { type: "finish", summary: "源码写入完成" } }
      ],
      { approval: new ApprovalGate(async () => true) }
    );

    const result = await harness.loop.run("更新凭据管理源码");

    expect(result).toMatchObject({ status: "completed", steps: 2 });
    expect(harness.handlerCalls.writeFile).toBe(1);
  });

  it("真实会话 Key 仍在写入 handler 调用前被阻断", async () => {
    const harness = await createHarness(
      [{
        raw: {
          type: "write_file",
          path: "leak.txt",
          content: "sk-fake-agent-key"
        }
      }],
      { approval: new ApprovalGate(async () => true) }
    );

    const result = await harness.loop.run("写入结果");

    expect(result).toMatchObject({ status: "blocked", steps: 1 });
    expect(result.trace.at(-1)).toMatchObject({ stopReason: "sensitive_action" });
    expect(harness.handlerCalls.writeFile).toBe(0);
  });

  it("测试文件允许假凭据夹具，但真实会话 Key 仍被阻断", async () => {
    const fixtureHarness = await createHarness(
      [
        {
          raw: {
            type: "write_file",
            path: "tests/cli.test.ts",
            content: 'const apiKey = "sk-cli-provider-key";'
          }
        },
        { raw: { type: "finish", summary: "测试夹具写入完成" } }
      ],
      { approval: new ApprovalGate(async () => true) }
    );
    const secretHarness = await createHarness(
      [{
        raw: {
          type: "write_file",
          path: "tests/leak.test.ts",
          content: "sk-fake-agent-key"
        }
      }],
      { approval: new ApprovalGate(async () => true) }
    );

    expect(await fixtureHarness.loop.run("补测试")).toMatchObject({ status: "completed" });
    expect(fixtureHarness.handlerCalls.writeFile).toBe(1);
    expect(await secretHarness.loop.run("写入真实 Key")).toMatchObject({ status: "blocked" });
    expect(secretHarness.handlerCalls.writeFile).toBe(0);
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
    expect(result.summary).toBe("Provider 请求受限，请稍后重试");
    expect(JSON.stringify(result)).not.toContain("secret remote body");
  });

  it("Action JSON 无效时反馈一次格式纠正并继续，且不沿用上一步审批状态", async () => {
    const harness = await createHarness([]);
    const writeFile = vi.fn(async () => "written");
    const dispatcher = new Dispatcher();
    dispatcher.register("write_file", writeFile);
    dispatcher.register("finish", (action) => action.summary);
    const provider = {
      complete: vi.fn()
        .mockResolvedValueOnce({
          raw: { type: "write_file", path: "game.py", content: "class Game: pass" }
        })
        .mockRejectedValueOnce(Object.assign(new Error("invalid remote body"), {
          code: "PROVIDER_ACTION_INVALID"
        }))
        .mockResolvedValueOnce({ raw: { type: "finish", summary: "已修正格式并完成" } })
    };
    const loop = new AgentLoop({
      provider,
      memory: harness.memory,
      dispatcher,
      trace: harness.trace,
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(async () => true),
      maxSteps: 3
    });

    const result = await loop.run("创建 game.py");

    expect(result).toMatchObject({ status: "completed", steps: 3, summary: "已修正格式并完成" });
    expect(provider.complete).toHaveBeenCalledTimes(3);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(provider.complete.mock.calls[2]?.[0].observations).toEqual([
      expect.stringContaining("PROVIDER_ACTION_INVALID")
    ]);
    expect(result.trace[1]).toMatchObject({
      policy: "allow",
      approval: "not_required",
      status: "running",
      observation: expect.stringContaining("只包含一个合法 JSON 对象")
    });
    expect(result.trace[1]?.stopReason).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("invalid remote body");
  });

  it("Action JSON 连续两次无效时停止且不继续请求", async () => {
    const harness = await createHarness([]);
    const provider = {
      complete: vi.fn(async () => {
        throw Object.assign(new Error("invalid remote body"), {
          code: "PROVIDER_ACTION_INVALID"
        });
      })
    };
    const loop = new AgentLoop({
      provider,
      memory: harness.memory,
      dispatcher: new Dispatcher(),
      trace: harness.trace,
      policy: new PolicyEngine({ allowedCommands: [] }),
      maxSteps: 8
    });

    const result = await loop.run("创建 game.py");

    expect(result).toMatchObject({
      status: "failed",
      steps: 2,
      summary: "模型 Action JSON 格式无效"
    });
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(result.trace).toHaveLength(2);
    expect(result.trace[0]).toMatchObject({ status: "running" });
    expect(result.trace[1]).toMatchObject({
      status: "failed",
      stopReason: "provider_action_invalid",
      approval: "not_required"
    });
    expect(JSON.stringify(result)).not.toContain("invalid remote body");
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

  it("PATH_NOT_FOUND 会反馈给下一轮并允许模型改读正确路径", async () => {
    const harness = await createHarness(
      [
        { raw: { type: "read_file", path: "missing.ts" } },
        { raw: { type: "read_file", path: "README.md" } },
        { raw: { type: "finish", summary: "已纠正路径" } }
      ],
      {
        maxSteps: 3,
        readFile: (path) => path === "missing.ts"
          ? { ok: false, error: { code: "PATH_NOT_FOUND", message: "文件不存在" } }
          : { ok: true, value: "项目说明" }
      }
    );

    const result = await harness.loop.run("先定位再读取文件");

    expect(result).toMatchObject({ status: "completed", steps: 3, summary: "已纠正路径" });
    expect(harness.provider.calls).toHaveLength(3);
    expect(harness.provider.calls[1]?.observations).toContain(
      "recoverable_error: PATH_NOT_FOUND: 文件不存在"
    );
    expect(result.trace[0]).toMatchObject({
      status: "running",
      observation: "recoverable_error: PATH_NOT_FOUND: 文件不存在"
    });
  });

  it("同一动作连续两次 PATH_NOT_FOUND 后停止以避免循环", async () => {
    const harness = await createHarness(
      [
        { raw: { type: "read_file", path: "missing.ts" } },
        { raw: { type: "read_file", path: "missing.ts" } }
      ],
      {
        readFile: () => ({
          ok: false,
          error: { code: "PATH_NOT_FOUND", message: "文件不存在" }
        })
      }
    );

    const result = await harness.loop.run("读取文件");

    expect(result).toMatchObject({ status: "failed", steps: 2 });
    expect(harness.provider.calls).toHaveLength(2);
    expect(result.trace.at(-1)).toMatchObject({
      status: "failed",
      stopReason: "repeated_recoverable_error"
    });
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
