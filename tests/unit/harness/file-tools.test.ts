import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FileTools } from "../../../packages/harness/src/index.js";

describe("FileTools", () => {
  it("通过路径守卫安全读写 UTF-8 文本", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-file-tools-"));
    const tools = new FileTools(workspace);

    await expect(tools.writeText("notes.txt", "你好，T07")).resolves.toEqual({
      ok: true,
      value: undefined
    });
    await expect(tools.readText("notes.txt")).resolves.toEqual({
      ok: true,
      value: "你好，T07"
    });
    await expect(readFile(join(workspace, "notes.txt"), "utf8")).resolves.toBe("你好，T07");
  });

  it("非法写入路径被拒绝且没有文件副作用", async () => {
    const parent = await mkdtemp(join(tmpdir(), "ai4se-file-side-effect-"));
    const workspace = join(parent, "workspace");
    const outsideFile = join(parent, "outside.txt");
    await writeFile(outsideFile, "原内容", "utf8");
    await mkdir(workspace);

    const result = await new FileTools(workspace).writeText("../outside.txt", "被篡改");

    expect(result.ok).toBe(false);
    await expect(readFile(outsideFile, "utf8")).resolves.toBe("原内容");
  });

  it("敏感文件写入被拒绝且不创建文件", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-file-sensitive-"));
    const sensitiveFile = join(workspace, ".env");

    const result = await new FileTools(workspace).writeText(".env", "TOKEN=secret");

    expect(result.ok).toBe(false);
    await expect(access(sensitiveFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("读取指向敏感文件的内部符号链接时不泄漏内容", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-file-sensitive-link-"));
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

    const result = await new FileTools(workspace).readText(
      process.platform === "win32" ? "public/value.txt" : "public.txt"
    );

    expect(result).toMatchObject({ ok: false, error: { code: "PATH_SENSITIVE" } });
    expect(JSON.stringify(result)).not.toContain("不应泄漏");
    await unlink(publicLink);
  });
});
