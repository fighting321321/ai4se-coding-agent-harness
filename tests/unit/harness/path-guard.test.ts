import { mkdtemp, mkdir, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PathGuard } from "../../../packages/harness/src/index.js";

describe("PathGuard", () => {
  it("解析 workspace 内的正常相对路径", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-path-safe-"));
    const sourceDirectory = join(workspace, "src");
    const sourceFile = join(sourceDirectory, "index.ts");
    await mkdir(sourceDirectory);
    await writeFile(sourceFile, "export {};", "utf8");

    const result = await new PathGuard(workspace).resolve("src/index.ts", "read");

    expect(result).toEqual({ ok: true, value: await realpath(sourceFile) });
  });

  it.each([
    { name: "绝对路径", path: join(tmpdir(), "outside.txt"), code: "PATH_INVALID" },
    { name: "上级目录逃逸", path: "../outside.txt", code: "PATH_OUTSIDE_WORKSPACE" },
    { name: "敏感文件", path: ".env", code: "PATH_SENSITIVE" }
  ])("拒绝$name", async ({ path, code }) => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-path-reject-"));

    const result = await new PathGuard(workspace).resolve(path, "write");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it("拒绝经目录符号链接逃逸的真实路径", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-path-link-workspace-"));
    const outside = await mkdtemp(join(tmpdir(), "ai4se-path-link-outside-"));
    const outsideFile = join(outside, "secret.txt");
    const link = join(workspace, "linked");
    await writeFile(outsideFile, "secret", "utf8");
    await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");

    const result = await new PathGuard(workspace).resolve("linked/secret.txt", "read");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PATH_OUTSIDE_WORKSPACE");
    }
    await unlink(link);
  });
});
