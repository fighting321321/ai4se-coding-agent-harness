import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  JsonTrace,
  Redactor,
  type TraceEntry
} from "../../../packages/harness/src/index.js";

async function tracePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-trace-"));
  return join(directory, "trace.json");
}

describe("JsonTrace", () => {
  it("记录尚无 Action 的 running 轮次", async () => {
    const trace = new JsonTrace(await tracePath(), new Redactor());
    const entry = {
      step: 1,
      policy: "allow",
      observation: "等待模型输出",
      status: "running"
    } as unknown as TraceEntry;

    expect(await trace.append(entry)).toEqual({ ok: true, value: entry });
    await expect(trace.read()).resolves.toEqual({ ok: true, value: [entry] });
  });

  it("按 step 顺序写入和读取结构化 Trace", async () => {
    const trace = new JsonTrace(await tracePath(), new Redactor());
    const second: TraceEntry = {
      step: 2,
      action: { type: "finish", summary: "完成" },
      policy: "allow",
      observation: "测试通过",
      status: "completed",
      stopReason: "任务完成"
    };
    const first: TraceEntry = {
      step: 1,
      action: { type: "read_file", path: "SPEC.md" },
      policy: "allow",
      observation: "读取成功",
      status: "completed"
    };

    await trace.append(second);
    await trace.append(first);

    await expect(trace.read()).resolves.toEqual({ ok: true, value: [first, second] });
  });

  it("写入前递归遮蔽 Action、Observation 和停机原因", async () => {
    const path = await tracePath();
    const trace = new JsonTrace(path, new Redactor(["sk-fake-trace-key"]));

    const result = await trace.append({
      step: 1,
      action: {
        type: "write_file",
        path: "result.txt",
        content: "sk-fake-trace-key"
      },
      policy: "ask",
      observation: "Bearer fake-trace-bearer",
      status: "blocked",
      stopReason: "api_key=fake-stop-key"
    });

    expect(result.ok).toBe(true);
    const raw = await readFile(path, "utf8");
    const readResult = await trace.read();
    expect(raw).not.toContain("fake-");
    expect(JSON.stringify(readResult)).not.toContain("fake-");
    expect(raw).toContain("[REDACTED]");
  });

  it("脱敏保存 Sensor、Checkpoint、父子关系与共享预算细节", async () => {
    const path = await tracePath();
    const trace = new JsonTrace(path, new Redactor(["sk-fake-trace-key"]));
    const entry: TraceEntry = {
      step: 1,
      action: { type: "delegate_agent", task: "inspect", allowedTools: ["read_file"] },
      policy: "allow",
      status: "running",
      details: [
        { type: "checkpoint_created", path: "target.txt" },
        { type: "sensor", name: "test", category: "fail", observation: "sk-fake-trace-key", truncated: false },
        { type: "subagent", phase: "completed", parentSessionId: "parent", childSessionId: "child", depth: 1, steps: 2, status: "completed" },
        { type: "budget", used: 3, remaining: 2 }
      ]
    };

    expect(await trace.append(entry)).toMatchObject({ ok: true });
    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("sk-fake-trace-key");
    expect(raw).toContain("[REDACTED]");
    await expect(trace.read()).resolves.toMatchObject({ ok: true });
  });

  it("以 v3 保存会话、输入、模型摘要与审批结果并可确定性回放", async () => {
    const path = await tracePath();
    const trace = new JsonTrace(path, new Redactor(["sk-fake-trace-key"]));
    const longOutput = `sk-fake-trace-key ${"x".repeat(700)}`;

    await trace.append({
      step: 1,
      sessionId: "session-1",
      userInputSummary: "读取项目说明",
      assistantOutputSummary: longOutput,
      action: { type: "read_file", path: "README.md" },
      policy: "allow",
      approval: "not_required",
      observation: "pass: read",
      status: "running"
    });
    await trace.appendHookEvent({
      sessionId: "session-1",
      kind: "PreToolUse",
      hook: "audit",
      status: "completed",
      actionType: "read_file"
    });

    const raw = await readFile(path, "utf8");
    expect(raw).toContain('"version": 3');
    expect(raw).not.toContain("sk-fake-trace-key");
    await expect(trace.replay()).resolves.toMatchObject({
      ok: true,
      value: {
        version: 3,
        entries: [{ sessionId: "session-1", approval: "not_required" }],
        hookEvents: [{ sessionId: "session-1", hook: "audit" }]
      }
    });
    const replay = await trace.replay();
    expect(replay.ok && replay.value.entries[0]?.assistantOutputSummary?.length).toBeLessThanOrEqual(512);
  });

  it("兼容读取 v1 与 v2 并在下一次写入时迁移为 v3", async () => {
    for (const version of [1, 2] as const) {
      const path = await tracePath();
      const entry: TraceEntry = { step: 1, policy: "allow", status: "completed" };
      await writeFile(path, JSON.stringify(version === 1
        ? { version, entries: [entry] }
        : { version, entries: [entry], hookEvents: [] }), "utf8");
      const trace = new JsonTrace(path, new Redactor());
      expect(await trace.read()).toEqual({ ok: true, value: [entry] });
      await trace.append({ step: 2, policy: "allow", status: "completed" });
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ version: 3 });
    }
  });

  it("拒绝超过一 MiB 的旧 Trace 且不覆盖原文件", async () => {
    const path = await tracePath();
    const source = JSON.stringify({ version: 1, entries: [], padding: "x".repeat(1024 * 1024) });
    await writeFile(path, source, "utf8");
    const result = await new JsonTrace(path, new Redactor()).read();
    expect(result).toMatchObject({ ok: false, error: { code: "TRACE_CORRUPT" } });
    await expect(readFile(path, "utf8")).resolves.toBe(source);
  });

  it("损坏的 Trace 返回稳定错误且不静默覆盖", async () => {
    const path = await tracePath();
    await writeFile(path, "[]", "utf8");
    const trace = new JsonTrace(path, new Redactor());

    expect(await trace.read()).toMatchObject({
      ok: false,
      error: { code: "TRACE_CORRUPT" }
    });
    await expect(readFile(path, "utf8")).resolves.toBe("[]");
  });

  it("拒绝包含重复 step 的 Trace 结构", async () => {
    const path = await tracePath();
    const entry: TraceEntry = {
      step: 1,
      action: { type: "finish", summary: "完成" },
      policy: "allow",
      status: "completed"
    };
    const source = JSON.stringify({ version: 1, entries: [entry, entry] });
    await writeFile(path, source, "utf8");

    const result = await new JsonTrace(path, new Redactor()).read();

    expect(result).toMatchObject({ ok: false, error: { code: "TRACE_CORRUPT" } });
    await expect(readFile(path, "utf8")).resolves.toBe(source);
  });
});
