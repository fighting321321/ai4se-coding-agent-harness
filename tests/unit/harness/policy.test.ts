import { describe, expect, it } from "vitest";

import { PolicyEngine, type Action } from "../../../packages/harness/src/index.js";

describe("PolicyEngine", () => {
  const allowedExecutable = process.execPath;
  const policy = new PolicyEngine({ allowedExecutables: [allowedExecutable] });

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
});
