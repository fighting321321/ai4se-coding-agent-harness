import { spawn } from "node:child_process";
import { basename } from "node:path";

export interface CommandToolOptions {
  allowedExecutables: readonly string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface CommandOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export type CommandToolErrorCode =
  | "COMMAND_NOT_ALLOWED"
  | "COMMAND_SHELL_DENIED"
  | "COMMAND_TIMEOUT"
  | "COMMAND_EXECUTION_FAILED";

export type CommandToolResult =
  | { ok: true; value: CommandOutput }
  | { ok: false; error: { code: CommandToolErrorCode; message: string } };

const SHELL_EXECUTABLES = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "sh",
  "zsh"
]);

function normalizedExecutable(executable: string): string {
  return process.platform === "win32" ? executable.toLowerCase() : executable;
}

function isShellExecutable(executable: string): boolean {
  return SHELL_EXECUTABLES.has(basename(executable).toLowerCase());
}

export class CommandTool {
  readonly #allowedExecutables: ReadonlySet<string>;
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;

  constructor(options: CommandToolOptions) {
    this.#allowedExecutables = new Set(options.allowedExecutables.map(normalizedExecutable));
    this.#timeoutMs = options.timeoutMs ?? 60_000;
    this.#maxOutputBytes = options.maxOutputBytes ?? 32 * 1024;
  }

  async execute(executable: string, args: readonly string[]): Promise<CommandToolResult> {
    if (isShellExecutable(executable)) {
      return {
        ok: false,
        error: { code: "COMMAND_SHELL_DENIED", message: "拒绝启动 Shell 解释器" }
      };
    }

    if (!this.#allowedExecutables.has(normalizedExecutable(executable))) {
      return {
        ok: false,
        error: { code: "COMMAND_NOT_ALLOWED", message: "可执行文件不在允许列表中" }
      };
    }

    return await new Promise<CommandToolResult>((resolveResult) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let capturedBytes = 0;
      let truncated = false;
      let timedOut = false;
      let settled = false;
      let child;

      const capture = (target: Buffer[], chunk: Buffer): void => {
        const remaining = this.#maxOutputBytes - capturedBytes;
        if (remaining <= 0) {
          truncated = true;
          return;
        }

        const accepted = chunk.subarray(0, remaining);
        target.push(accepted);
        capturedBytes += accepted.length;
        truncated ||= accepted.length < chunk.length;
      };

      const settle = (result: CommandToolResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolveResult(result);
      };

      try {
        child = spawn(executable, [...args], {
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });
      } catch {
        resolveResult({
          ok: false,
          error: { code: "COMMAND_EXECUTION_FAILED", message: "命令进程启动失败" }
        });
        return;
      }

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.#timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
      child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
      child.on("error", () => {
        settle({
          ok: false,
          error: { code: "COMMAND_EXECUTION_FAILED", message: "命令进程执行失败" }
        });
      });
      child.on("close", (exitCode) => {
        if (timedOut) {
          settle({
            ok: false,
            error: { code: "COMMAND_TIMEOUT", message: "命令执行超过时间限制" }
          });
          return;
        }

        settle({
          ok: true,
          value: {
            exitCode,
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
            truncated
          }
        });
      });
    });
  }
}
