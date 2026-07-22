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
    { name: "环境变量文件", path: ".env", code: "PATH_SENSITIVE" },
    { name: "Git 凭据文件", path: ".git-credentials", code: "PATH_SENSITIVE" },
    { name: "netrc 凭据文件", path: ".netrc", code: "PATH_SENSITIVE" },
    { name: "SSH 私钥", path: "id_rsa", code: "PATH_SENSITIVE" }
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

  it("拒绝安全别名指向的真实敏感文件", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-path-sensitive-link-"));
    const sensitiveFile =
      process.platform === "win32"
        ? join(workspace, ".secrets", "value.txt")
        : join(workspace, ".env");
    const publicLink = join(workspace, process.platform === "win32" ? "public" : "public.txt");
    if (process.platform === "win32") {
      await mkdir(join(workspace, ".secrets"));
    }
    await writeFile(sensitiveFile, "TOKEN=不应泄漏", "utf8");
    await symlink(
      process.platform === "win32" ? join(workspace, ".secrets") : sensitiveFile,
      publicLink,
      process.platform === "win32" ? "junction" : "file"
    );

    const result = await new PathGuard(workspace).resolve(
      process.platform === "win32" ? "public/value.txt" : "public.txt",
      "read"
    );

    expect(result).toMatchObject({ ok: false, error: { code: "PATH_SENSITIVE" } });
    expect(JSON.stringify(result)).not.toContain("不应泄漏");
    await unlink(publicLink);
  });
});
