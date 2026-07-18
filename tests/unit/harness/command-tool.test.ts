import { access, mkdtemp, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CommandTool } from "../../../packages/harness/src/index.js";

describe("CommandTool", () => {
  it("使用 executable 与 args 执行白名单命令", async () => {
    const args = ["-e", "process.stdout.write('ok')"] as const;
    const tool = new CommandTool({
      allowedCommands: [{ executable: process.execPath, args }]
    });

    const result = await tool.execute(process.execPath, args);

    expect(result).toEqual({
      ok: true,
      value: { exitCode: 0, stdout: "ok", stderr: "", truncated: false }
    });
  });

  it("在启动进程前拒绝非白名单 executable", async () => {
    const result = await new CommandTool({ allowedCommands: [] }).execute(
      "not-allowed",
      []
    );

    expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_NOT_ALLOWED" } });
  });

  it.each(["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "sh", "bash"])(
    "拒绝 Shell 启动器 %s",
    async (executable) => {
      const result = await new CommandTool({
        allowedCommands: [{ executable, args: [] }]
      }).execute(executable, []);

      expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_SHELL_DENIED" } });
    }
  );

  it("超时后终止子进程并返回稳定错误", async () => {
    const tool = new CommandTool({
      allowedCommands: [
        { executable: process.execPath, args: ["-e", "setTimeout(() => {}, 10_000)"] }
      ],
      timeoutMs: 20
    });

    const result = await tool.execute(process.execPath, ["-e", "setTimeout(() => {}, 10_000)"]);

    expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_TIMEOUT" } });
  });

  it("stdout 与 stderr 合计最多保留 32 KiB", async () => {
    const args = [
      "-e",
      "process.stdout.write('a'.repeat(20_000)); process.stderr.write('b'.repeat(20_000))"
    ] as const;
    const tool = new CommandTool({
      allowedCommands: [{ executable: process.execPath, args }]
    });

    const result = await tool.execute(process.execPath, args);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.byteLength(result.value.stdout) + Buffer.byteLength(result.value.stderr)).toBe(
        32 * 1024
      );
      expect(result.value.truncated).toBe(true);
    }
  });

  it("同一 executable 的未批准参数不会执行", async () => {
    const tool = new CommandTool({
      allowedCommands: [{ executable: process.execPath, args: ["--version"] }]
    });

    const result = await tool.execute(process.execPath, [
      "-e",
      "require('node:fs').rmSync('不应执行的文件')"
    ]);

    expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_NOT_ALLOWED" } });
  });

  it.each([
    { executableName: "rm", args: ["-rf", "."] },
    { executableName: "git", args: ["clean", "-fdx"] }
  ])(
    "即使完整调用被列入规则也在 spawn 前拒绝删除命令 $executableName $args",
    async ({ executableName, args }) => {
      const executable = join(tmpdir(), "ai4se-command-missing", executableName);
      const tool = new CommandTool({
        allowedCommands: [{ executable, args }]
      });

      const result = await tool.execute(executable, args);

      expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_NOT_ALLOWED" } });
    }
  );

  it(
    "超时不依赖 close，并在短宽限内终止进程树后返回",
    async () => {
      const workspace = await mkdtemp(join(tmpdir(), "ai4se-command-tree-"));
      const descendantMarker = join(workspace, "descendant-alive.txt");
      const descendant = [
        "setTimeout(() =>",
        `require('node:fs').writeFileSync(${JSON.stringify(descendantMarker)}, 'alive'),`,
        "1_000);"
      ].join(" ");
      const source =
        process.platform === "win32"
          ? [
              "const { spawn } = require('node:child_process');",
              `spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}],`,
              "{ stdio: ['ignore', 'inherit', 'inherit'] });",
              "setInterval(() => {}, 10_000);"
            ].join(" ")
          : "process.on('SIGTERM', () => {}); setInterval(() => {}, 10_000);";
      const args = ["-e", source] as const;
      const tool = new CommandTool({
        allowedCommands: [{ executable: process.execPath, args }],
        timeoutMs: 200,
        terminationGraceMs: 50
      });
      const startedAt = Date.now();

      const result = await tool.execute(process.execPath, args);
      const elapsed = Date.now() - startedAt;
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      let descendantSurvived: boolean;
      try {
        await access(descendantMarker);
        descendantSurvived = true;
        await unlink(descendantMarker);
      } catch {
        descendantSurvived = false;
      }

      expect(result).toMatchObject({ ok: false, error: { code: "COMMAND_TIMEOUT" } });
      expect(elapsed).toBeLessThan(900);
      expect(descendantSurvived).toBe(false);
    },
    3_000
  );
});
