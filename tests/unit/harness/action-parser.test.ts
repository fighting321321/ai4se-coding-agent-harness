import { describe, expect, it } from "vitest";

import { parseAction, type Action } from "../../../packages/harness/src/index.js";

describe("parseAction", () => {
  it.each<Action>([
    { type: "read_file", path: "src/index.ts" },
    { type: "write_file", path: "src/index.ts", content: "export {};" },
    { type: "run_command", executable: "pnpm", args: ["test"] },
    { type: "finish", summary: "测试已经通过" }
  ])("严格接受合法动作 $type", (action) => {
    expect(parseAction(action)).toEqual({ ok: true, value: action });
  });

  it.each([
    { name: "未知动作", raw: { type: "delete_file", path: "src/index.ts" } },
    { name: "缺少字段", raw: { type: "read_file" } },
    {
      name: "包含多余字段",
      raw: { type: "finish", summary: "完成", unexpected: true }
    },
    { name: "使用 Shell 命令字符串", raw: { type: "run_command", command: "pnpm test" } },
    {
      name: "参数包含非字符串",
      raw: { type: "run_command", executable: "pnpm", args: ["test", 1] }
    }
  ])("拒绝$name", ({ raw }) => {
    const result = parseAction(raw);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ACTION_PARSE_FAILED");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });
});
