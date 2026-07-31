import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  AgentLoop,
  ApprovalGate,
  Dispatcher,
  FeedbackSensorSuite,
  FileTools,
  HookManager,
  JsonMemory,
  JsonTrace,
  PolicyEngine,
  Redactor,
  ScriptedMockLLM,
  SharedStepBudget,
  SubagentManager,
  WorkspaceCheckpoint,
  type ChildAgentRequest,
  type LLMOutput,
  type SensorExecutor
} from "../../../packages/harness/src/index.js";

async function baseHarness(
  script: readonly LLMOutput[],
  options: {
    readonly workspace?: string;
    readonly sensors?: FeedbackSensorSuite;
    readonly checkpoint?: WorkspaceCheckpoint;
    readonly hooks?: HookManager;
    readonly subagents?: SubagentManager;
    readonly budget?: SharedStepBudget;
    readonly maxSteps?: number;
  } = {}
) {
  const workspace = options.workspace ?? await mkdtemp(join(tmpdir(), "ai4se-t16-loop-"));
  const redactor = new Redactor(["sk-fake-t16-secret"]);
  const memory = new JsonMemory(join(workspace, "memory.json"), redactor);
  const trace = new JsonTrace(join(workspace, "trace.json"), redactor);
  const dispatcher = new Dispatcher();
  const files = new FileTools(workspace);
  dispatcher.register("read_file", (action) => files.readText(action.path));
  dispatcher.register("write_file", (action) => files.writeText(action.path, action.content));
  return {
    workspace,
    trace,
    provider: new ScriptedMockLLM(script),
    loop: new AgentLoop({
      provider: new ScriptedMockLLM(script),
      memory,
      dispatcher,
      trace,
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(async () => true),
      checkpoint: options.checkpoint,
      sensors: options.sensors,
      hooks: options.hooks,
      subagents: options.subagents,
      budget: options.budget,
      maxSteps: options.maxSteps
    })
  };
}

describe("T16 AgentLoop integration", () => {
  it("写文件成功后自动运行结构化 Sensor 并保留变更", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-t16-pass-"));
    await writeFile(join(workspace, "target.txt"), "before", "utf8");
    const execute = vi.fn<SensorExecutor>(async () => ({
      ok: true,
      value: { exitCode: 0, stdout: "ok", stderr: "", truncated: false }
    }));
    const harness = await baseHarness([
      { raw: { type: "write_file", path: "target.txt", content: "after" } },
      { raw: { type: "finish", summary: "done" } }
    ], {
      workspace,
      checkpoint: new WorkspaceCheckpoint({ workspace }),
      sensors: new FeedbackSensorSuite({
        sensors: [{ name: "test", executable: "safe-tool", args: ["test"] }],
        execute
      })
    });

    const result = await harness.loop.run("write and verify");

    expect(result.status).toBe("completed");
    expect(await readFile(join(workspace, "target.txt"), "utf8")).toBe("after");
    expect(execute).toHaveBeenCalledWith("safe-tool", ["test"]);
    expect(result.trace[0]?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "checkpoint_created", path: "target.txt" }),
      expect.objectContaining({ type: "sensor", name: "test", category: "pass" })
    ]));
    expect(result.trace[0]?.details).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "checkpoint_restored" })
    ]));
  });

  it("Sensor 业务失败时恢复原文件并把脱敏反馈回灌给下一轮", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-t16-restore-"));
    await writeFile(join(workspace, "target.txt"), "before", "utf8");
    const provider = new ScriptedMockLLM([
      { raw: { type: "write_file", path: "target.txt", content: "after" } },
      { raw: { type: "finish", summary: "handled" } }
    ]);
    const redactor = new Redactor(["sk-fake-t16-secret"]);
    const memory = new JsonMemory(join(workspace, "memory.json"), redactor);
    const trace = new JsonTrace(join(workspace, "trace.json"), redactor);
    const dispatcher = new Dispatcher();
    const files = new FileTools(workspace);
    dispatcher.register("write_file", (action) => files.writeText(action.path, action.content));
    const loop = new AgentLoop({
      provider,
      memory,
      dispatcher,
      trace,
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(async () => true),
      checkpoint: new WorkspaceCheckpoint({ workspace, redactor }),
      sensors: new FeedbackSensorSuite({
        sensors: [{ name: "test", executable: "safe-tool", args: ["test"] }],
        execute: async () => ({ ok: true, value: { exitCode: 1, stdout: "sk-fake-t16-secret failed", stderr: "", truncated: false } }),
        redactor
      })
    });

    const result = await loop.run("write then test");

    expect(result.status).toBe("completed");
    expect(await readFile(join(workspace, "target.txt"), "utf8")).toBe("before");
    expect(provider.calls[1]?.observations[0]).toContain("[REDACTED]");
    expect(JSON.stringify(result)).not.toContain("sk-fake-t16-secret");
    expect(result.trace[0]?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "sensor", category: "fail" }),
      expect.objectContaining({ type: "checkpoint_restored", ok: true })
    ]));
  });

  it("PreToolUse 阻断发生在快照与写入之前", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-t16-hook-"));
    await writeFile(join(workspace, "target.txt"), "before", "utf8");
    const checkpoint = new WorkspaceCheckpoint({ workspace });
    const capture = vi.spyOn(checkpoint, "capture");
    const harness = await baseHarness([
      { raw: { type: "write_file", path: "target.txt", content: "after" } }
    ], {
      workspace,
      checkpoint,
      hooks: new HookManager({ hooks: [{ name: "block-write", preToolUse: () => ({ block: true }) }] })
    });

    const result = await harness.loop.run("blocked write");

    expect(result.status).toBe("blocked");
    expect(capture).not.toHaveBeenCalled();
    expect(await readFile(join(workspace, "target.txt"), "utf8")).toBe("before");
  });

  it("工具失败后恢复既有文件，恢复失败则固定记录且不伪称成功", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-t16-tool-fail-"));
    await writeFile(join(workspace, "target.txt"), "before", "utf8");
    const redactor = new Redactor();
    const dispatcher = new Dispatcher();
    dispatcher.register("write_file", async () => {
      await writeFile(join(workspace, "target.txt"), "partial", "utf8");
      return { ok: false as const, error: { code: "FILE_WRITE_FAILED", message: "failed" } };
    });
    const trace = new JsonTrace(join(workspace, "trace.json"), redactor);
    const loop = new AgentLoop({
      provider: new ScriptedMockLLM([{ raw: { type: "write_file", path: "target.txt", content: "after" } }]),
      memory: new JsonMemory(join(workspace, "memory.json"), redactor),
      dispatcher,
      trace,
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(async () => true),
      checkpoint: new WorkspaceCheckpoint({ workspace })
    });

    const result = await loop.run("write fails");

    expect(result.status).toBe("failed");
    expect(await readFile(join(workspace, "target.txt"), "utf8")).toBe("before");
    expect(result.trace[0]?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "checkpoint_restored", ok: true })
    ]));

    const unsafeWorkspace = await mkdtemp(join(tmpdir(), "ai4se-t16-restore-fail-"));
    await writeFile(join(unsafeWorkspace, "target.txt"), "before", "utf8");
    const unsafe = await baseHarness([
      { raw: { type: "write_file", path: "target.txt", content: "after" } }
    ], {
      workspace: unsafeWorkspace,
      checkpoint: new WorkspaceCheckpoint({ workspace: unsafeWorkspace }),
      sensors: new FeedbackSensorSuite({
        sensors: [{ name: "test", executable: "safe", args: ["test"] }],
        execute: async () => {
          await unlink(join(unsafeWorkspace, "target.txt"));
          await mkdir(join(unsafeWorkspace, "target.txt"));
          return { ok: true, value: { exitCode: 1, stdout: "failed", stderr: "", truncated: false } };
        }
      })
    });

    const unsafeResult = await unsafe.loop.run("unsafe restore");

    expect(unsafeResult.status).toBe("failed");
    expect(unsafeResult.trace[0]?.observation).toBe("environment_error: CHECKPOINT_RESTORE_UNSAFE");
    expect(unsafeResult.trace[0]?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "checkpoint_restored", ok: false, code: "CHECKPOINT_RESTORE_UNSAFE" })
    ]));
  });

  it("外部命令只记录不可快照限制，不声称已由 Checkpoint 回滚", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-t16-command-limit-"));
    const dispatcher = new Dispatcher();
    dispatcher.register("run_command", () => ({
      ok: true,
      value: { exitCode: 1, stdout: "failed", stderr: "", truncated: false }
    }));
    const trace = new JsonTrace(join(workspace, "trace.json"), new Redactor());
    const loop = new AgentLoop({
      provider: new ScriptedMockLLM([
        { raw: { type: "run_command", executable: "safe", args: ["test"] } },
        { raw: { type: "finish", summary: "acknowledged" } }
      ]),
      memory: new JsonMemory(join(workspace, "memory.json"), new Redactor()),
      dispatcher,
      trace,
      policy: new PolicyEngine({ allowedCommands: [{ executable: "safe", args: ["test"] }] }),
      checkpoint: new WorkspaceCheckpoint({ workspace })
    });

    const result = await loop.run("external command limitation");

    expect(result.status).toBe("completed");
    expect(result.trace[0]?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "rollback_limit",
        actionType: "run_command",
        reason: "external_side_effect_not_snapshot_capable"
      })
    ]));
    expect(result.trace[0]?.details).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "checkpoint_restored" })
    ]));
  });

  it("父 Agent 串行委派嵌套 ScriptedMockLLM，共享预算且只接收子摘要", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-t16-child-"));
    await writeFile(join(workspace, "README.md"), "public", "utf8");
    const budget = new SharedStepBudget(6);
    const childProviders: ScriptedMockLLM[] = [];
    const createChild = async (request: ChildAgentRequest) => {
      const provider = new ScriptedMockLLM([
        { raw: { type: "read_file", path: "README.md" }, assistantText: "child reads" },
        { raw: { type: "finish", summary: "child found sk-fake-t16-secret" }, assistantText: "child done" }
      ]);
      childProviders.push(provider);
      const redactor = new Redactor(["sk-fake-t16-secret"]);
      const dispatcher = new Dispatcher();
      const files = new FileTools(workspace);
      dispatcher.register("read_file", (action) => files.readText(action.path));
      return await new AgentLoop({
        provider,
        memory: new JsonMemory(join(workspace, `memory-${request.childId}.json`), redactor),
        dispatcher,
        trace: new JsonTrace(join(workspace, `trace-${request.childId}.json`), redactor),
        policy: new PolicyEngine({ allowedCommands: [] }),
        session: request.session,
        maxSteps: request.maxSteps,
        budget: request.budget,
        depth: request.depth,
        allowedActions: request.allowedTools
      }).run(request.task);
    };
    const subagents = new SubagentManager({
      createChild,
      maxDepth: 2,
      maxStepsPerChild: 3,
      allowedTools: ["read_file"],
      redactor: new Redactor(["sk-fake-t16-secret"])
    });
    const harness = await baseHarness([
      { raw: { type: "delegate_agent", task: "inspect README", allowedTools: ["read_file"] } },
      { raw: { type: "finish", summary: "parent done" } }
    ], { workspace, subagents, budget, maxSteps: 3 });

    const result = await harness.loop.run("delegate analysis");

    expect(result.status).toBe("completed");
    expect(childProviders).toHaveLength(1);
    expect(childProviders[0]?.calls[0]?.messages).toEqual([{ role: "user", content: "inspect README" }]);
    expect(JSON.stringify(result)).not.toContain("sk-fake-t16-secret");
    expect(result.trace[0]?.observation).toContain("[REDACTED]");
    expect(result.trace[0]?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "subagent", phase: "started", parentSessionId: "session" }),
      expect.objectContaining({ type: "subagent", phase: "completed", steps: 2, status: "completed" }),
      expect.objectContaining({ type: "budget", used: 3, remaining: 3 })
    ]));
    expect(budget.used).toBe(4);
  });

  it("子 Agent 即使模型请求写入也会在父级未授权工具前零调用阻断", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-t16-child-deny-"));
    let writes = 0;
    const budget = new SharedStepBudget(4);
    const subagents = new SubagentManager({
      allowedTools: ["read_file"],
      createChild: async (request) => {
        const dispatcher = new Dispatcher();
        dispatcher.register("write_file", () => { writes += 1; return "written"; });
        return await new AgentLoop({
          provider: new ScriptedMockLLM([{ raw: { type: "write_file", path: "x.txt", content: "no" } }]),
          memory: new JsonMemory(join(workspace, `memory-${request.childId}.json`), new Redactor()),
          dispatcher,
          trace: new JsonTrace(join(workspace, `trace-${request.childId}.json`), new Redactor()),
          policy: new PolicyEngine({ allowedCommands: [] }),
          session: request.session,
          maxSteps: request.maxSteps,
          budget: request.budget,
          depth: request.depth,
          allowedActions: request.allowedTools
        }).run(request.task);
      }
    });
    const harness = await baseHarness([
      { raw: { type: "delegate_agent", task: "read only", allowedTools: ["read_file"] } },
      { raw: { type: "finish", summary: "parent handled child block" } }
    ], { workspace, subagents, budget, maxSteps: 2 });

    const result = await harness.loop.run("delegate read only");

    expect(result.status).toBe("completed");
    expect(writes).toBe(0);
    expect(result.trace[0]?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "subagent", phase: "completed", status: "blocked" })
    ]));
  });
});
