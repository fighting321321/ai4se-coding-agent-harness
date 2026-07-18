import { describe, expect, it } from "vitest";

import { CommandTool } from "../../../packages/harness/src/index.js";

describe("CommandTool", () => {
  it("使用 executable 与 args 执行白名单命令", async () => {
    const tool = new CommandTool({ allowedExecutables: [process.execPath] });

    const result = await tool.execute(process.execPath, ["-e", "process.stdout.write('ok')"]);

    expect(result).toEqual({
      ok: true,
      value: { exitCode: 0, stdout: "ok", stderr: "", truncated: false }
    });
  });

  it("在启动进程前拒绝非白名单 executable", async () => {
    const result = await new CommandTool({ allowedExecutables: [] }).execute(
      "not-allowed",
      []
    );

    expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_NOT_ALLOWED" } });
  });

  it.each(["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "sh", "bash"])(
    "拒绝 Shell 启动器 %s",
    async (executable) => {
      const result = await new CommandTool({ allowedExecutables: [executable] }).execute(
        executable,
        []
      );

      expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_SHELL_DENIED" } });
    }
  );

  it("超时后终止子进程并返回稳定错误", async () => {
    const tool = new CommandTool({
      allowedExecutables: [process.execPath],
      timeoutMs: 20
    });

    const result = await tool.execute(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"]);

    expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_TIMEOUT" } });
  });

  it("stdout 与 stderr 合计最多保留 32 KiB", async () => {
    const tool = new CommandTool({ allowedExecutables: [process.execPath] });

    const result = await tool.execute(process.execPath, [
      "-e",
      "process.stdout.write('a'.repeat(20_000)); process.stderr.write('b'.repeat(20_000))"
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.byteLength(result.value.stdout) + Buffer.byteLength(result.value.stderr)).toBe(
        32 * 1024
      );
      expect(result.value.truncated).toBe(true);
    }
  });
});
