import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CredentialStore,
  JsonMemory,
  JsonTrace,
  Redactor,
  runInteractiveSession,
  type CredentialStoreBoundary,
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
  lines: readonly (string | undefined)[],
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
  it("在 /exit 固化完成候选，并让同一工作区的新进程检索相关记忆", async () => {
    const cwd = await sessionWorkspace();
    const configPath = join(cwd, ".ai4se", "config.json");
    const firstRun = vi.fn(async (options: RunHarnessTaskOptions) => {
      options.memoryLifecycle?.collectCompletedTask(options.task, "Vitest 测试全部通过");
      return completed("Vitest 测试全部通过");
    });
    const first = captureSession(["修复 Vitest 测试", "/exit"], firstRun);

    expect(await runInteractiveSession({ cwd, configPath }, first.dependencies)).toBe(0);

    const retrieved: string[][] = [];
    const secondRun = vi.fn(async (options: RunHarnessTaskOptions) => {
      const result = await options.memoryLifecycle!.retrieve(options.task);
      retrieved.push(result.ok ? result.value.map((item) => item.content) : []);
      return completed("继续完成");
    });
    const second = captureSession(["继续检查 Vitest", "/exit"], secondRun);

    expect(await runInteractiveSession({ cwd, configPath }, second.dependencies)).toBe(0);
    expect(retrieved).toEqual([["Vitest 测试全部通过"]]);
  });

  it("/new 先固化候选并只重置短期上下文，不清除长期 Memory", async () => {
    const cwd = await sessionWorkspace();
    const configPath = join(cwd, ".ai4se", "config.json");
    const runTask = vi.fn(async (options: RunHarnessTaskOptions) => {
      options.memoryLifecycle?.collectCompletedTask(options.task, "TypeScript 检查完成");
      return completed("TypeScript 检查完成");
    });
    const capture = captureSession(["检查 TypeScript", "/new", "/memory", "/exit"], runTask);

    expect(await runInteractiveSession({ cwd, configPath }, capture.dependencies)).toBe(0);

    expect(capture.stdout.join("\n")).toContain("TypeScript 检查完成");
    const persisted = await new JsonMemory(
      join(cwd, ".ai4se", "memory.json"),
      new Redactor()
    ).read();
    expect(persisted.ok && persisted.value).toHaveLength(1);
  });

  it("/memory 显示安全摘要，clear 只有确认后才清空", async () => {
    const cwd = await sessionWorkspace();
    const configPath = join(cwd, ".ai4se", "config.json");
    const memory = new JsonMemory(join(cwd, ".ai4se", "memory.json"), new Redactor());
    await memory.upsert({
      id: "safe-convention",
      kind: "convention",
      tags: ["vitest"],
      content: "测试使用 Vitest",
      updatedAt: "2026-07-29T08:00:00.000Z"
    });
    const confirmMemoryClear = vi.fn(async () => true);
    const capture = captureSession(
      ["/memory", "/memory clear", "/memory", "/exit"],
      vi.fn(async () => completed("不应执行"))
    );

    const exitCode = await runInteractiveSession(
      { cwd, configPath },
      { ...capture.dependencies, confirmMemoryClear }
    );

    expect(exitCode).toBe(0);
    expect(confirmMemoryClear).toHaveBeenCalledTimes(1);
    expect(capture.stdout.join("\n")).toContain("[约定] 测试使用 Vitest");
    expect(capture.stdout.join("\n")).toContain("Memory 为空");
    expect(capture.stdout.join("\n")).not.toContain("updatedAt");
    await expect(memory.read()).resolves.toEqual({ ok: true, value: [] });
  });

  it("拒绝清空时保留 Memory", async () => {
    const cwd = await sessionWorkspace();
    const configPath = join(cwd, ".ai4se", "config.json");
    const memory = new JsonMemory(join(cwd, ".ai4se", "memory.json"), new Redactor());
    await memory.upsert({
      id: "safe-result",
      kind: "recent_result",
      tags: ["build"],
      content: "构建通过",
      updatedAt: "2026-07-29T08:00:00.000Z"
    });
    const capture = captureSession(
      ["/memory clear", "/exit"],
      vi.fn(async () => completed("不应执行"))
    );

    await runInteractiveSession(
      { cwd, configPath },
      { ...capture.dependencies, confirmMemoryClear: async () => false }
    );

    expect(capture.stdout.join("\n")).toContain("已取消清空 Memory");
    const persisted = await memory.read();
    expect(persisted.ok && persisted.value).toHaveLength(1);
  });

  it("输入 EOF 和可控异常都会尝试固化，异常输出不包含原始错误", async () => {
    const eofCwd = await sessionWorkspace();
    const eofConfig = join(eofCwd, ".ai4se", "config.json");
    const eofRun = vi.fn(async (options: RunHarnessTaskOptions) => {
      options.memoryLifecycle?.collectCompletedTask(options.task, "EOF 前完成");
      return completed("EOF 前完成");
    });
    const eofCapture = captureSession(["检查 EOF", undefined], eofRun);
    expect(await runInteractiveSession({ cwd: eofCwd, configPath: eofConfig }, eofCapture.dependencies))
      .toBe(0);

    const errorCwd = await sessionWorkspace();
    const errorConfig = join(errorCwd, ".ai4se", "config.json");
    const errorRun = vi.fn(async (options: RunHarnessTaskOptions): Promise<RunTaskResult> => {
      options.memoryLifecycle?.collectCompletedTask(options.task, "异常前完成");
      throw new Error("sk-raw-exception-secret");
    });
    const errorCapture = captureSession(["检查异常"], errorRun);
    expect(await runInteractiveSession(
      { cwd: errorCwd, configPath: errorConfig },
      errorCapture.dependencies
    )).toBe(1);

    const eofMemory = await new JsonMemory(join(eofCwd, ".ai4se", "memory.json"), new Redactor()).read();
    const errorMemory = await new JsonMemory(join(errorCwd, ".ai4se", "memory.json"), new Redactor()).read();
    expect(eofMemory.ok && eofMemory.value[0]?.content).toBe("EOF 前完成");
    expect(errorMemory.ok && errorMemory.value[0]?.content).toBe("异常前完成");
    expect(errorCapture.stderr.join("\n")).toContain("会话运行失败");
    expect(errorCapture.stderr.join("\n")).not.toContain("sk-raw-exception-secret");
    const eofHooks = await new JsonTrace(
      join(eofCwd, ".ai4se", "trace.json"),
      new Redactor()
    ).readHookEvents();
    const errorHooks = await new JsonTrace(
      join(errorCwd, ".ai4se", "trace.json"),
      new Redactor()
    ).readHookEvents();
    expect(eofHooks.ok && eofHooks.value.map((event) => [event.kind, event.reason])).toEqual([
      ["SessionStart", undefined],
      ["SessionEnd", "eof"]
    ]);
    expect(errorHooks.ok && errorHooks.value.map((event) => [event.kind, event.reason])).toEqual([
      ["SessionStart", undefined],
      ["SessionEnd", "error"]
    ]);
  });

  it("通过可替换的凭据存储边界读取 API Key", async () => {
    const cwd = await sessionWorkspace();
    const read = vi.fn(async () => ({
      ok: true as const,
      value: "sk-injected-session-key"
    }));
    const credentialStore: CredentialStoreBoundary = {
      status: vi.fn(),
      init: vi.fn(),
      read,
      update: vi.fn(),
      clear: vi.fn()
    };
    const runTask = vi.fn(async () => completed("注入成功"));
    const capture = captureSession(["检查注入", "/exit"], runTask);

    const exitCode = await runInteractiveSession(
      { cwd, configPath: join(cwd, ".ai4se", "config.json") },
      { ...capture.dependencies, credentialStoreFactory: () => credentialStore }
    );

    expect(exitCode).toBe(0);
    expect(read).toHaveBeenCalledWith("master-password");
    expect(runTask).toHaveBeenCalledWith(expect.objectContaining({
      provider: expect.objectContaining({ apiKey: "sk-injected-session-key" })
    }));
  });

  it("显示并使用启动目录作为工作区，不采用配置中的旧 workspace", async () => {
    const cwd = await sessionWorkspace();
    const configPath = join(cwd, ".ai4se", "config.json");
    await writeFile(
      configPath,
      `${JSON.stringify({
        workspace: "legacy-subdirectory",
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
    const runTask = vi.fn(async () => completed("不应执行"));
    const capture = captureSession(["/status", "/exit"], runTask);

    const exitCode = await runInteractiveSession(
      { cwd, configPath },
      capture.dependencies
    );

    expect(exitCode).toBe(0);
    expect(capture.stdout.join("\n")).toContain(`工作区：${cwd}`);
    expect(capture.stdout.join("\n")).not.toContain("legacy-subdirectory");
  });

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
    expect(runTask.mock.calls[0]?.[0].session).toBe(runTask.mock.calls[1]?.[0].session);
    expect(capture.dependencies.readLine).toHaveBeenCalledTimes(3);
    expect(capture.dependencies.readLine).toHaveBeenNthCalledWith(1, "\nai4se> ");
    expect(capture.dependencies.readLine).toHaveBeenNthCalledWith(2, "\nai4se> ");
    expect(capture.dependencies.readLine).toHaveBeenNthCalledWith(3, "\nai4se> ");
    expect(capture.stdout).toContain("");
    expect(capture.stdout).not.toContain("ai4se>");
    expect(capture.stdout.join("\n")).toContain("完成：总结 README");
    expect(JSON.stringify([capture.stdout, capture.stderr])).not.toContain(
      "sk-session-secret"
    );
  });

  it("/new 只清空当前短期会话并让后续任务复用已重置的上下文", async () => {
    const cwd = await sessionWorkspace();
    const snapshots: unknown[] = [];
    const runTask = vi.fn(async (options: RunHarnessTaskOptions) => {
      snapshots.push(options.session?.snapshot());
      options.session?.beginTurn(options.task);
      options.session?.appendAssistant(`回答：${options.task}`);
      return completed(options.task);
    });
    const capture = captureSession(["第一题", "/new", "第二题", "/exit"], runTask);

    await runInteractiveSession(
      { cwd, configPath: join(cwd, ".ai4se", "config.json") },
      capture.dependencies
    );

    expect(snapshots).toEqual([
      { currentGoal: "", summary: "", messages: [] },
      { currentGoal: "", summary: "", messages: [] }
    ]);
    expect(capture.stdout.join("\n")).toContain("已开始新对话");
  });

  it("/model 查看当前模型，直接填写合法新模型后原子保存并用于后续任务", async () => {
    const cwd = await sessionWorkspace();
    const configPath = join(cwd, ".ai4se", "config.json");
    const runTask = vi.fn(async () => completed("完成"));
    const capture = captureSession(["/model", "/model next-model", "检查模型", "/exit"], runTask);

    const exitCode = await runInteractiveSession({ cwd, configPath }, capture.dependencies);
    const persisted = JSON.parse(await readFile(configPath, "utf8")) as {
      readonly provider: { readonly model: string };
    };

    expect(exitCode).toBe(0);
    expect(capture.stdout.join("\n")).toContain("当前模型：test-model");
    expect(capture.stdout.join("\n")).toContain("模型已切换：next-model");
    expect(persisted.provider.model).toBe("next-model");
    expect(runTask).toHaveBeenCalledWith(expect.objectContaining({
      provider: expect.objectContaining({ model: "next-model" })
    }));
  });

  it("/model 拒绝空白、控制字符或过长名称且不改写配置", async () => {
    const cwd = await sessionWorkspace();
    const configPath = join(cwd, ".ai4se", "config.json");
    const runTask = vi.fn(async () => completed("不应执行"));
    const capture = captureSession([`/model ${"x".repeat(201)}`, "/exit"], runTask);

    await runInteractiveSession({ cwd, configPath }, capture.dependencies);
    const persisted = await readFile(configPath, "utf8");

    expect(capture.stderr.join("\n")).toContain("模型名称无效");
    expect(persisted).toContain('"model":"test-model"');
    expect(runTask).not.toHaveBeenCalled();
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
