import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import {
  isCommandAllowed,
  isDestructiveCommand,
  isShellExecutable,
  snapshotCommandRules,
  type CommandRule
} from "./command-rule.js";

export interface CommandToolOptions {
  allowedCommands: readonly CommandRule[];
  cwd?: string;
  timeoutMs?: number;
  terminationGraceMs?: number;
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

export class CommandTool {
  readonly #allowedCommands: readonly CommandRule[];
  readonly #cwd: string | undefined;
  readonly #timeoutMs: number;
  readonly #terminationGraceMs: number;
  readonly #maxOutputBytes: number;

  constructor(options: CommandToolOptions) {
    this.#allowedCommands = snapshotCommandRules(options.allowedCommands);
    this.#cwd = options.cwd;
    this.#timeoutMs = options.timeoutMs ?? 60_000;
    this.#terminationGraceMs = options.terminationGraceMs ?? 250;
    this.#maxOutputBytes = options.maxOutputBytes ?? 32 * 1024;
  }

  async execute(executable: string, args: readonly string[]): Promise<CommandToolResult> {
    if (isShellExecutable(executable)) {
      return {
        ok: false,
        error: { code: "COMMAND_SHELL_DENIED", message: "拒绝启动 Shell 解释器" }
      };
    }

    if (isDestructiveCommand(executable, args)) {
      return {
        ok: false,
        error: { code: "COMMAND_NOT_ALLOWED", message: "拒绝执行删除类命令" }
      };
    }

    if (!isCommandAllowed(this.#allowedCommands, executable, args)) {
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
      let child: ChildProcessByStdio<null, Readable, Readable>;
      let forceTimeout: ReturnType<typeof setTimeout> | undefined;

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
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
        if (forceTimeout !== undefined) {
          clearTimeout(forceTimeout);
        }
        child.stdout.removeAllListeners();
        child.stderr.removeAllListeners();
        child.removeAllListeners("close");
        child.removeAllListeners("error");
        child.on("error", () => undefined);
        resolveResult(result);
      };

      const timeoutResult = (): CommandToolResult => ({
        ok: false,
        error: { code: "COMMAND_TIMEOUT", message: "命令执行超过时间限制" }
      });

      const killPosixGroup = (signal: NodeJS.Signals): void => {
        if (child.pid === undefined) {
          child.kill(signal);
          return;
        }
        try {
          process.kill(-child.pid, signal);
        } catch {
          child.kill(signal);
        }
      };

      const killWindowsTree = (): void => {
        if (child.pid === undefined) {
          child.kill();
          return;
        }
        try {
          const killer = spawn(
            "taskkill.exe",
            ["/pid", String(child.pid), "/t", "/f"],
            { shell: false, stdio: "ignore", windowsHide: true }
          );
          killer.on("error", () => child.kill());
          killer.unref();
        } catch {
          child.kill();
        }
      };

      try {
        child = spawn(executable, [...args], {
          cwd: this.#cwd,
          detached: process.platform !== "win32",
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
        if (process.platform === "win32") {
          killWindowsTree();
        } else {
          killPosixGroup("SIGTERM");
        }

        forceTimeout = setTimeout(() => {
          if (process.platform === "win32") {
            killWindowsTree();
          } else {
            killPosixGroup("SIGKILL");
          }
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          settle(timeoutResult());
        }, this.#terminationGraceMs);
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
          settle(timeoutResult());
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
