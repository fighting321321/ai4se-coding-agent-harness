import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Redactor, WorkspaceCheckpoint } from "../../../packages/harness/src/index.js";

describe("WorkspaceCheckpoint", () => {
  it("只恢复明确快照的既有单个文件", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-checkpoint-"));
    await writeFile(join(workspace, "target.txt"), "before", "utf8");
    await writeFile(join(workspace, "other.txt"), "untouched", "utf8");
    const checkpoints = new WorkspaceCheckpoint({ workspace });

    const snapshot = await checkpoints.capture("target.txt");
    expect(snapshot.ok).toBe(true);
    await writeFile(join(workspace, "target.txt"), "after", "utf8");
    await writeFile(join(workspace, "other.txt"), "changed elsewhere", "utf8");
    if (!snapshot.ok) return;

    const restored = await checkpoints.restore(snapshot.value);

    expect(restored).toMatchObject({ ok: true, value: { path: "target.txt", restored: true } });
    expect(await readFile(join(workspace, "target.txt"), "utf8")).toBe("before");
    expect(await readFile(join(workspace, "other.txt"), "utf8")).toBe("changed elsewhere");
  });

  it("原本不存在时只删除本次创建的明确单文件", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-checkpoint-new-"));
    const checkpoints = new WorkspaceCheckpoint({ workspace });
    const snapshot = await checkpoints.capture("created.txt");
    expect(snapshot.ok).toBe(true);
    await writeFile(join(workspace, "created.txt"), "new", "utf8");
    if (!snapshot.ok) return;

    expect(await checkpoints.restore(snapshot.value)).toMatchObject({ ok: true });
    await expect(readFile(join(workspace, "created.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("允许快照凭据管理源码但仍拒绝真实会话 Key", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-checkpoint-credential-source-"));
    const secret = "sk-live-checkpoint-key-123456";
    await writeFile(
      join(workspace, "cli.ts"),
      "interface Options { apiKey: string }\nconst apiKey = credential.value;",
      "utf8"
    );
    await writeFile(join(workspace, "leak.txt"), secret, "utf8");
    const checkpoints = new WorkspaceCheckpoint({
      workspace,
      redactor: new Redactor([secret])
    });

    await expect(checkpoints.capture("cli.ts")).resolves.toMatchObject({ ok: true });
    await expect(checkpoints.capture("leak.txt")).resolves.toMatchObject({
      ok: false,
      error: { code: "CHECKPOINT_SENSITIVE" }
    });
  });

  it("测试文件快照允许假凭据夹具，但仍拒绝当前会话真实 Key", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-checkpoint-test-fixture-"));
    const secret = "sk-live-checkpoint-key-123456";
    await mkdir(join(workspace, "tests"));
    await writeFile(join(workspace, "tests", "fixture.test.ts"), "sk-cli-provider-key", "utf8");
    await writeFile(join(workspace, "tests", "leak.test.ts"), secret, "utf8");
    const checkpoints = new WorkspaceCheckpoint({
      workspace,
      redactor: new Redactor([secret])
    });

    await expect(checkpoints.capture("tests/fixture.test.ts")).resolves.toMatchObject({ ok: true });
    await expect(checkpoints.capture("tests/leak.test.ts")).resolves.toMatchObject({
      ok: false,
      error: { code: "CHECKPOINT_SENSITIVE" }
    });
  });

  it("拒绝目录、符号链接、敏感内容、敏感路径和超限文件", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-checkpoint-bounds-"));
    await mkdir(join(workspace, "folder"));
    await writeFile(join(workspace, "secret.txt"), "sk-fake-checkpoint-key", "utf8");
    await writeFile(join(workspace, "large.txt"), "x".repeat(9), "utf8");
    await writeFile(join(workspace, "real.txt"), "ok", "utf8");
    let linked = true;
    try {
      await symlink(join(workspace, "real.txt"), join(workspace, "link.txt"));
    } catch {
      linked = false;
    }
    const checkpoints = new WorkspaceCheckpoint({
      workspace,
      redactor: new Redactor(["sk-fake-checkpoint-key"])
    });
    const smallCheckpoints = new WorkspaceCheckpoint({ workspace, maxFileBytes: 8 });

    await expect(checkpoints.capture("folder")).resolves.toMatchObject({ ok: false, error: { code: "CHECKPOINT_NOT_FILE" } });
    await expect(checkpoints.capture("secret.txt")).resolves.toMatchObject({ ok: false, error: { code: "CHECKPOINT_SENSITIVE" } });
    await expect(smallCheckpoints.capture("large.txt")).resolves.toMatchObject({ ok: false, error: { code: "CHECKPOINT_TOO_LARGE" } });
    await expect(checkpoints.capture(".git/config")).resolves.toMatchObject({ ok: false });
    if (linked) {
      await expect(checkpoints.capture("link.txt")).resolves.toMatchObject({ ok: false, error: { code: "CHECKPOINT_SYMLINK" } });
    }
  });

  it("恢复目标被替换为目录时明确失败且不递归清理", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-checkpoint-fail-"));
    const checkpoints = new WorkspaceCheckpoint({ workspace });
    const snapshot = await checkpoints.capture("created");
    expect(snapshot.ok).toBe(true);
    await mkdir(join(workspace, "created"));
    if (!snapshot.ok) return;

    await expect(checkpoints.restore(snapshot.value)).resolves.toMatchObject({
      ok: false,
      error: { code: "CHECKPOINT_RESTORE_UNSAFE" }
    });
  });

  it("成功提交后丢弃内存快照且不能再次恢复", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-checkpoint-discard-"));
    await writeFile(join(workspace, "target.txt"), "before", "utf8");
    const checkpoints = new WorkspaceCheckpoint({ workspace });
    const snapshot = await checkpoints.capture("target.txt");
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;

    expect(checkpoints.discard(snapshot.value)).toEqual({ ok: true, value: undefined });
    await expect(checkpoints.restore(snapshot.value)).resolves.toMatchObject({
      ok: false,
      error: { code: "CHECKPOINT_INVALID" }
    });
  });
});
