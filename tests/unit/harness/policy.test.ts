import { describe, expect, it } from "vitest";

import { PolicyEngine, type Action } from "../../../packages/harness/src/index.js";

describe("PolicyEngine", () => {
  const allowedExecutable = process.execPath;
  const policy = new PolicyEngine({
    allowedCommands: [{ executable: allowedExecutable, args: ["--version"] }]
  });

  it.each<{ action: Action; decision: "allow" | "ask" | "deny" }>([
    { action: { type: "read_file", path: "README.md" }, decision: "allow" },
    {
      action: { type: "write_file", path: "notes.txt", content: "内容" },
      decision: "ask"
    },
    {
      action: { type: "run_command", executable: allowedExecutable, args: ["--version"] },
      decision: "allow"
    },
    { action: { type: "finish", summary: "完成" }, decision: "allow" }
  ])("对 $action.type 返回 $decision", ({ action, decision }) => {
    expect(policy.evaluate(action)).toBe(decision);
  });

  it.each<Action>([
    { type: "read_file", path: "../secret.txt" },
    { type: "write_file", path: ".env", content: "TOKEN=secret" },
    { type: "run_command", executable: "cmd.exe", args: ["/c", "echo unsafe"] },
    { type: "run_command", executable: allowedExecutable, args: ["rm", "-rf", "."] },
    { type: "run_command", executable: "not-allowed", args: [] }
  ])("确定性拒绝危险动作 $type", (action) => {
    expect(policy.evaluate(action)).toBe("deny");
  });

  it.each([
    {
      executable: allowedExecutable,
      args: ["-e", "require('node:fs').rmSync('README.md')"]
    },
    { executable: "git", args: ["clean", "-fdx"] }
  ])("拒绝未精确批准的调用 $executable $args", ({ executable, args }) => {
    const exactPolicy = new PolicyEngine({
      allowedCommands: [
        { executable: allowedExecutable, args: ["--version"] },
        { executable: "git", args: ["status", "--short"] }
      ]
    });

    expect(exactPolicy.evaluate({ type: "run_command", executable, args })).toBe("deny");
  });

  it.each([
    { executable: "rm", args: ["-rf", "."] },
    { executable: "git", args: ["clean", "-fdx"] },
    { executable: "git", args: ["rm", "--cached", "README.md"] },
    { executable: "git", args: ["reset", "--hard"] }
  ])("即使完整调用被列入规则也拒绝删除命令 $executable $args", ({ executable, args }) => {
    const policyWithDangerousRule = new PolicyEngine({
      allowedCommands: [{ executable, args }]
    });

    expect(
      policyWithDangerousRule.evaluate({ type: "run_command", executable, args })
    ).toBe("deny");
  });
});
