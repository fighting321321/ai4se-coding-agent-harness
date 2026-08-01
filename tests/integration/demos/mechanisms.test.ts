import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AgentLoop,
  ApprovalGate,
  CommandTool,
  Dispatcher,
  FileTools,
  JsonMemory,
  JsonTrace,
  PolicyEngine,
  Redactor,
  ScriptedMockLLM,
  type Action,
  type CommandRule,
  type LLMOutput
} from "../../../packages/harness/src/index.js";

type RunCommandAction = Extract<Action, { type: "run_command" }>;

interface DemoHarnessOptions {
  readonly allowedCommands?: readonly CommandRule[];
  readonly runCommand?: (action: RunCommandAction, call: number) => unknown | Promise<unknown>;
}

async function createDemoHarness(
  script: readonly LLMOutput[],
  options: DemoHarnessOptions = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-mechanisms-demo-"));
  const redactor = new Redactor();
  const memory = new JsonMemory(join(directory, "memory.json"), redactor);
  const trace = new JsonTrace(join(directory, "trace.json"), redactor);
  const allowedCommands = options.allowedCommands ?? [];
  const policy = new PolicyEngine({ allowedCommands });
  const approval = new ApprovalGate();
  const dispatcher = new Dispatcher();
  const files = new FileTools(directory);
  const command = new CommandTool({ allowedCommands });
  const handlerCalls = { readFile: 0, writeFile: 0, runCommand: 0, finish: 0 };
  const commandActions: RunCommandAction[] = [];

  dispatcher.register("read_file", async (action) => {
    handlerCalls.readFile += 1;
    return await files.readText(action.path);
  });
  dispatcher.register("write_file", async (action) => {
    handlerCalls.writeFile += 1;
    return await files.writeText(action.path, action.content);
  });
  dispatcher.register("run_command", async (action) => {
    handlerCalls.runCommand += 1;
    commandActions.push({ ...action, args: [...action.args] });
    return options.runCommand === undefined
      ? await command.execute(action.executable, action.args)
      : await options.runCommand(action, handlerCalls.runCommand);
  });
  dispatcher.register("finish", (action) => {
    handlerCalls.finish += 1;
    return action.summary;
  });

  const provider = new ScriptedMockLLM(script);
  return {
    loop: new AgentLoop({
      provider,
      memory,
      dispatcher,
      trace,
      policy,
      approval,
      maxSteps: 8
    }),
    provider,
    handlerCalls,
    commandActions
  };
}

describe("T10 三项完全离线机制演示", () => {
  describe("演示 1：治理阻断且零副作用", () => {
    it.each([
      {
        name: "危险删除命令",
        action: {
          type: "run_command",
          executable: "rm",
          args: ["-rf", "demo-target"]
        } as const,
        allowedCommands: [{ executable: "rm", args: ["-rf", "demo-target"] }]
      },
      {
        name: "敏感文件访问",
        action: { type: "read_file", path: ".env" } as const,
        allowedCommands: []
      }
    ])("$name 在治理层被拒绝且所有 handler 保持零调用", async ({
      action,
      allowedCommands
    }) => {
      const harness = await createDemoHarness([{ raw: action }], { allowedCommands });

      const result = await harness.loop.run(`阻断${action.type}`);

      expect(result).toMatchObject({
        status: "blocked",
        summary: "策略拒绝该动作",
        steps: 1
      });
      expect(harness.provider.calls).toHaveLength(1);
      expect(harness.handlerCalls).toEqual({
        readFile: 0,
        writeFile: 0,
        runCommand: 0,
        finish: 0
      });
      expect(result.trace).toEqual([
        expect.objectContaining({
          action,
          policy: "deny",
          observation: "blocked: POLICY_DENIED",
          status: "blocked",
          stopReason: "policy_denied"
        })
      ]);
    });
  });

  it("演示 2：首次业务失败反馈后改用成功动作并 finish", async () => {
    const sensitiveOutput = "sk-demo-business-secret";
    const legacyRule = { executable: "safe-tool", args: ["verify", "legacy"] } as const;
    const fixedRule = { executable: "safe-tool", args: ["verify", "fixed"] } as const;
    const harness = await createDemoHarness(
      [
        { raw: { type: "run_command", ...legacyRule } },
        { raw: { type: "run_command", ...fixedRule } },
        { raw: { type: "finish", summary: "修正动作验证成功" } }
      ],
      {
        allowedCommands: [legacyRule, fixedRule],
        runCommand: (action) => ({
          ok: true,
          value: action.args[1] === "legacy"
            ? {
                exitCode: 7,
                stdout: "",
                stderr: `target legacy invalid; api_key=${sensitiveOutput}`,
                truncated: false
              }
            : { exitCode: 0, stdout: "fixed", stderr: "", truncated: false }
        })
      }
    );

    const result = await harness.loop.run("验证并修正目标");
    const feedback = harness.provider.calls[1]?.observations[0];

    expect(result).toMatchObject({
      status: "completed",
      summary: "修正动作验证成功",
      steps: 3
    });
    expect(harness.provider.calls).toHaveLength(3);
    expect(harness.provider.calls[0]?.observations).toEqual([]);
    expect(harness.provider.calls[1]?.observations).toHaveLength(1);
    expect(feedback).toContain("fail: command exited 7");
    expect(feedback).toContain("target legacy invalid");
    expect(feedback).toContain("[REDACTED]");
    expect(feedback).not.toContain(sensitiveOutput);
    expect(harness.provider.calls[2]?.observations).toEqual([
      "pass: command exited 0: fixed"
    ]);
    expect(harness.commandActions).toEqual([
      { type: "run_command", ...legacyRule },
      { type: "run_command", ...fixedRule }
    ]);
    expect(harness.handlerCalls).toEqual({
      readFile: 0,
      writeFile: 0,
      runCommand: 2,
      finish: 0
    });
    expect(result.trace.map((entry) => entry.status)).toEqual([
      "running",
      "running",
      "completed"
    ]);
    expect(JSON.stringify([harness.provider.calls, result])).not.toContain(sensitiveOutput);
  });

  it("演示 3：第二次连续业务失败后按既定原因立即停机", async () => {
    const firstRule = { executable: "safe-tool", args: ["verify", "first"] } as const;
    const secondRule = { executable: "safe-tool", args: ["verify", "second"] } as const;
    const harness = await createDemoHarness(
      [
        { raw: { type: "run_command", ...firstRule } },
        { raw: { type: "run_command", ...secondRule } },
        { raw: { type: "finish", summary: "不应请求第三次 Provider" } }
      ],
      {
        allowedCommands: [firstRule, secondRule],
        runCommand: (_action, call) => ({
          ok: true,
          value: {
            exitCode: call === 1 ? 5 : 6,
            stdout: "",
            stderr: `attempt ${call} failed`,
            truncated: false
          }
        })
      }
    );

    const result = await harness.loop.run("失败后只允许修正一次");

    expect(result).toMatchObject({
      status: "failed",
      summary: "连续两次业务失败",
      steps: 2
    });
    expect(harness.provider.calls).toHaveLength(2);
    expect(harness.handlerCalls).toEqual({
      readFile: 0,
      writeFile: 0,
      runCommand: 2,
      finish: 0
    });
    expect(harness.commandActions).toEqual([
      { type: "run_command", ...firstRule },
      { type: "run_command", ...secondRule }
    ]);
    expect(result.trace).toHaveLength(2);
    expect(result.trace.map((entry) => entry.status)).toEqual(["running", "failed"]);
    expect(result.trace.at(-1)).toMatchObject({
      observation: "fail: command exited 6: attempt 2 failed",
      stopReason: "second_business_failure"
    });
  });
});
