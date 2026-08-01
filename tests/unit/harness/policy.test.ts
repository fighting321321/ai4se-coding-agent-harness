import { describe, expect, it } from "vitest";

import { PolicyEngine, type Action } from "../../../packages/harness/src/index.js";

describe("PolicyEngine", () => {
  it("允许本地 Skill 选择，但把外部 MCP 调用固定交给逐次批准", () => {
    const policy = new PolicyEngine({ allowedCommands: [] });

    expect(policy.evaluate({ type: "load_skill", name: "review" })).toBe("allow");
    expect(policy.evaluate({
      type: "call_mcp",
      server: "mock",
      tool: "lookup",
      arguments: {}
    })).toBe("ask");
  });
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
    { type: "run_command", executable: "rm", args: ["-rf", "."] }
  ])("确定性拒绝危险动作 $type", (action) => {
    expect(policy.evaluate(action)).toBe("deny");
  });

  it("未预授权的普通命令改为逐次询问", () => {
    const exactPolicy = new PolicyEngine({
      allowedCommands: [{ executable: allowedExecutable, args: ["--version"] }]
    });

    expect(exactPolicy.evaluate({
      type: "run_command",
      executable: "python",
      args: ["add.py"]
    })).toBe("ask");
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
