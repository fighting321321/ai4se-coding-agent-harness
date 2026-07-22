import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CredentialStore,
  runInteractiveSession,
  type InteractiveSessionDependencies,
  type RunHarnessTaskOptions,
  type RunTaskResult
} from "../../../packages/harness/src/index.js";

async function sessionWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "ai4se-session-"));
  await mkdir(join(cwd, ".ai4se"), { recursive: true });
  await writeFile(
    join(cwd, ".ai4se", "config.json"),
    `${JSON.stringify({
      workspace: ".",
      allowedCommands: [],
      maxSteps: 8,
      commandTimeoutMs: 5_000,
      maxOutputBytes: 4_096,
      memoryPath: ".ai4se/memory.json",
      provider: {
        baseUrl: "https://example.invalid/v1",
        model: "test-model"
      }
    })}\n`,
    "utf8"
  );
  await new CredentialStore(join(cwd, ".ai4se", "credentials.json")).init(
    "master-password",
    "sk-session-secret"
  );
  return cwd;
}

function captureSession(
  lines: readonly string[],
  runTask: (options: RunHarnessTaskOptions) => Promise<RunTaskResult>,
  askApproval?: InteractiveSessionDependencies["askApproval"]
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let lineIndex = 0;
  const readSecret = vi.fn(async () => "master-password");
  const clearScreen = vi.fn();
  const dependencies: InteractiveSessionDependencies = {
    readSecret,
    readLine: vi.fn(async () => lines[lineIndex++]),
    askApproval,
    runTask,
    clearScreen,
    writeOut: (message) => stdout.push(message),
    writeError: (message) => stderr.push(message)
  };
  return { stdout, stderr, readSecret, clearScreen, dependencies };
}

function completed(summary: string): RunTaskResult {
  return {
    ok: true,
    value: {
      status: "completed",
      summary,
      steps: 2,
      trace: [
        {
          step: 1,
          action: { type: "read_file", path: "README.md" },
          policy: "allow",
          observation: "pass: tool completed",
          status: "running"
        },
        {
          step: 2,
          action: { type: "finish", summary },
          policy: "allow",
          observation: "pass: finish",
          status: "completed",
          stopReason: "finish"
        }
      ]
    }
  };
}

describe("runInteractiveSession", () => {
  it("一次解锁凭据后连续执行多项任务，并且不输出 API Key", async () => {
    const cwd = await sessionWorkspace();
    const runTask = vi.fn(async (options: RunHarnessTaskOptions) =>
      completed(`完成：${options.task}`)
    );
    const capture = captureSession(["检查项目", "总结 README", "/exit"], runTask);

    const exitCode = await runInteractiveSession(
      { cwd, configPath: join(cwd, ".ai4se", "config.json") },
      capture.dependencies
    );

    expect(exitCode).toBe(0);
    expect(capture.readSecret).toHaveBeenCalledTimes(1);
    expect(runTask).toHaveBeenCalledTimes(2);
    expect(runTask.mock.calls.map(([options]) => options.task)).toEqual([
      "检查项目",
      "总结 README"
    ]);
    expect(runTask.mock.calls.every(([options]) =>
      options.provider.apiKey === "sk-session-secret"
    )).toBe(true);
    expect(capture.stdout.join("\n")).toContain("ai4se>");
    expect(capture.stdout.join("\n")).toContain("完成：总结 README");
    expect(JSON.stringify([capture.stdout, capture.stderr])).not.toContain(
      "sk-session-secret"
    );
  });

  it("本地命令和空输入不调用 Provider", async () => {
    const cwd = await sessionWorkspace();
    const runTask = vi.fn(async () => completed("不应执行"));
    const capture = captureSession(
      ["", "   ", "/help", "/status", "/trace", "/clear", "/exit"],
      runTask
    );

    const exitCode = await runInteractiveSession(
      { cwd, configPath: join(cwd, ".ai4se", "config.json") },
      capture.dependencies
    );

    expect(exitCode).toBe(0);
    expect(runTask).not.toHaveBeenCalled();
    expect(capture.clearScreen).toHaveBeenCalledTimes(1);
    expect(capture.stdout.join("\n")).toContain("/help");
    expect(capture.stdout.join("\n")).toContain("test-model");
    expect(capture.stdout.join("\n")).toContain("尚无本次会话 Trace");
  });

  it("每一个 ask 动作都单独询问，不缓存上一次批准", async () => {
    const cwd = await sessionWorkspace();
    const approve = vi.fn(async () => true);
    const runTask = vi.fn(async (options: RunHarnessTaskOptions) => {
      const request = {
        action: { type: "write_file" as const, path: "result.txt", content: "hidden" }
      };
      await options.approval?.(request);
      await options.approval?.(request);
      return completed("写入完成");
    });
    const capture = captureSession(["写入两个文件", "/exit"], runTask, approve);

    const exitCode = await runInteractiveSession(
      { cwd, configPath: join(cwd, ".ai4se", "config.json") },
      capture.dependencies
    );

    expect(exitCode).toBe(0);
    expect(approve).toHaveBeenCalledTimes(2);
  });
});
