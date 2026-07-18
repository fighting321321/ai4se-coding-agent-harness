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
