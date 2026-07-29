import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  JsonMemory,
  MemoryLifecycle,
  Redactor
} from "../../../packages/harness/src/index.js";

async function createLifecycle(secret = "sk-test-memory-secret") {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-memory-lifecycle-"));
  const path = join(directory, "memory.json");
  const redactor = new Redactor([secret]);
  const memory = new JsonMemory(path, redactor);
  const lifecycle = new MemoryLifecycle({
    memory,
    redactor,
    now: () => new Date("2026-07-29T08:00:00.000Z")
  });
  return { lifecycle, memory, path, secret };
}

describe("MemoryLifecycle", () => {
  it("只接受明确约定前缀，拒绝秘密且不保存完整输入", async () => {
    const { lifecycle, secret } = await createLifecycle();

    expect(lifecycle.collectExplicitConvention("以后请使用 pnpm")).toBe(false);
    expect(lifecycle.collectExplicitConvention("记住约定：测试统一使用 Vitest")).toBe(true);
    expect(lifecycle.collectExplicitConvention(`记住约定：API key=${secret}`)).toBe(false);

    const pending = lifecycle.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      kind: "convention",
      content: "测试统一使用 Vitest"
    });
    expect(JSON.stringify(pending)).not.toContain(secret);
  });

  it("完成任务候选经过脱敏、限长、稳定排序和语义去重", async () => {
    const { lifecycle, secret } = await createLifecycle();
    const largeBody = `生成报告 ${"正文".repeat(1_000)}`;

    expect(lifecycle.collectCompletedTask("修复 TypeScript Vitest 测试", largeBody)).toBe(true);
    expect(lifecycle.collectCompletedTask("修复 TypeScript Vitest 测试", largeBody)).toBe(true);
    expect(lifecycle.collectCompletedTask("泄露检查", `完成 ${secret}`)).toBe(false);

    const pending = lifecycle.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.kind).toBe("recent_result");
    expect(pending[0]?.content.length).toBeLessThanOrEqual(320);
    expect(pending[0]?.tags).toEqual([...pending[0]!.tags].sort());
    expect(JSON.stringify(pending)).not.toContain(secret);
    expect(JSON.stringify(pending)).not.toContain("正文".repeat(200));
  });

  it("一次原子固化全部候选，重复固化不产生重复项，重启后仅检索相关项", async () => {
    const { lifecycle, path } = await createLifecycle();
    lifecycle.collectExplicitConvention("记住约定：TypeScript 测试使用 Vitest");
    lifecycle.collectCompletedTask("修复 TypeScript 测试", "Vitest 测试全部通过");

    await expect(lifecycle.consolidate()).resolves.toMatchObject({
      ok: true,
      value: { written: 2 }
    });
    await expect(lifecycle.consolidate()).resolves.toMatchObject({
      ok: true,
      value: { written: 0 }
    });

    const restarted = new MemoryLifecycle({
      memory: new JsonMemory(path, new Redactor()),
      redactor: new Redactor()
    });
    const relevant = await restarted.retrieve("继续修复 Vitest 测试");
    const unrelated = await restarted.retrieve("设计数据库迁移");

    expect(relevant).toMatchObject({ ok: true });
    expect(relevant.ok && relevant.value.length).toBe(2);
    expect(unrelated).toEqual({ ok: true, value: [] });
    const persisted = JSON.parse(await readFile(path, "utf8")) as { items: unknown[] };
    expect(persisted.items).toHaveLength(2);
  });

  it("Memory 损坏时固化失败但不覆盖原文件，并返回固定脱敏错误", async () => {
    const { lifecycle, path, secret } = await createLifecycle();
    await writeFile(path, "{broken", "utf8");
    lifecycle.collectCompletedTask("安全检查", "完成安全检查");

    const result = await lifecycle.consolidate();

    expect(result).toMatchObject({ ok: false, error: { code: "MEMORY_CORRUPT" } });
    expect(JSON.stringify(result)).not.toContain(secret);
    await expect(readFile(path, "utf8")).resolves.toBe("{broken");
    expect(lifecycle.pending()).toHaveLength(1);
  });
});
