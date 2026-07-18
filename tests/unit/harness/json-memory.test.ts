import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  JsonMemory,
  Redactor,
  type MemoryItem,
  type MemorySearchQuery
} from "../../../packages/harness/src/index.js";

async function memoryPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-memory-"));
  return join(directory, "memory.json");
}

const convention: MemoryItem = {
  id: "typescript-style",
  kind: "convention",
  tags: ["typescript", "style"],
  content: "TypeScript 源码使用严格模式",
  updatedAt: "2026-07-18T12:00:00.000Z"
};

describe("JsonMemory", () => {
  it("把不存在的文件视为空库", async () => {
    const memory = new JsonMemory(await memoryPath(), new Redactor());

    await expect(memory.read()).resolves.toEqual({ ok: true, value: [] });
  });

  it("按 id 写入和更新项目约定", async () => {
    const path = await memoryPath();
    const memory = new JsonMemory(path, new Redactor());

    expect(await memory.upsert(convention)).toEqual({ ok: true, value: convention });
    const updated = { ...convention, content: "TypeScript 使用严格模式和 ESM" };
    expect(await memory.upsert(updated)).toEqual({ ok: true, value: updated });
    await expect(memory.read()).resolves.toEqual({ ok: true, value: [updated] });
  });

  it("按标签和关键词进行有限且确定的相关检索", async () => {
    const memory = new JsonMemory(await memoryPath(), new Redactor());
    const recent: MemoryItem = {
      id: "test-result",
      kind: "recent_result",
      tags: ["vitest", "typescript"],
      content: "Vitest 测试全部通过",
      updatedAt: "2026-07-18T13:00:00.000Z"
    };
    await memory.upsert(convention);
    await memory.upsert(recent);

    const result = await memory.search({
      tags: ["typescript"],
      keywords: ["Vitest"],
      limit: 1
    });

    expect(result).toEqual({ ok: true, value: [recent] });
  });

  it.each([
    { name: "非数组 tags", query: { tags: "typescript" } },
    { name: "null keywords", query: { keywords: null } }
  ])("$name 返回查询错误而不是抛出异常", async ({ query }) => {
    const memory = new JsonMemory(await memoryPath(), new Redactor());

    const result = await memory.search(query as unknown as MemorySearchQuery);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "MEMORY_INVALID_QUERY" }
    });
  });

  it("拒绝将敏感值写入 Memory", async () => {
    const memory = new JsonMemory(
      await memoryPath(),
      new Redactor(["sk-fake-memory-key"])
    );

    const result = await memory.upsert({
      ...convention,
      content: "结果包含 sk-fake-memory-key"
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "MEMORY_SENSITIVE_CONTENT" }
    });
    expect(JSON.stringify(result)).not.toContain("sk-fake-memory-key");
  });

  it("清空 Memory", async () => {
    const memory = new JsonMemory(await memoryPath(), new Redactor());
    await memory.upsert(convention);

    expect(await memory.clear()).toEqual({ ok: true, value: undefined });
    await expect(memory.read()).resolves.toEqual({ ok: true, value: [] });
  });

  it.each([
    { name: "语法损坏", source: "{broken" },
    { name: "根结构错误", source: "[]" },
    {
      name: "重复 id",
      source: JSON.stringify({ version: 1, items: [convention, convention] })
    }
  ])("$name 的 JSON 返回稳定错误且不被覆盖", async ({ source }) => {
    const path = await memoryPath();
    await writeFile(path, source, "utf8");
    const memory = new JsonMemory(path, new Redactor());

    const result = await memory.read();

    expect(result).toMatchObject({ ok: false, error: { code: "MEMORY_CORRUPT" } });
    await expect(readFile(path, "utf8")).resolves.toBe(source);
  });
});
