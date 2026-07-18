import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseHarnessConfig } from "../../../packages/harness/src/index.js";

const validConfig = {
  workspace: "./workspace",
  allowedCommands: [{ executable: "pnpm", args: ["test"] }],
  maxSteps: 20,
  commandTimeoutMs: 120_000,
  maxOutputBytes: 64 * 1024,
  memoryPath: ".ai4se/memory.json"
};

describe("parseHarnessConfig", () => {
  it("接受完整且严格的本地 Harness 配置", () => {
    const result = parseHarnessConfig(validConfig);

    expect(result).toEqual({ ok: true, value: validConfig });
  });

  it.each([
    {
      name: "未知字段",
      input: { ...validConfig, extra: true },
      code: "CONFIG_UNKNOWN_FIELD"
    },
    {
      name: "命令规则中的未知字段",
      input: {
        ...validConfig,
        allowedCommands: [{ executable: "pnpm", args: ["test"], shell: false }]
      },
      code: "CONFIG_UNKNOWN_FIELD"
    },
    {
      name: "越界的最大步数",
      input: { ...validConfig, maxSteps: 0 },
      code: "CONFIG_INVALID_VALUE"
    },
    {
      name: "绝对 Memory 路径",
      input: { ...validConfig, memoryPath: join(process.cwd(), "memory.json") },
      code: "CONFIG_STORAGE_PATH_INVALID"
    },
    {
      name: "逃逸 Memory 路径",
      input: { ...validConfig, memoryPath: "../memory.json" },
      code: "CONFIG_STORAGE_PATH_INVALID"
    },
    {
      name: "空白 Memory 路径",
      input: { ...validConfig, memoryPath: "   " },
      code: "CONFIG_STORAGE_PATH_INVALID"
    },
    {
      name: "API Key 字段",
      input: { ...validConfig, apiKey: "sk-fake-config-secret" },
      code: "CONFIG_SECRET_FIELD"
    },
    {
      name: "嵌套 secret 字段",
      input: {
        ...validConfig,
        allowedCommands: [
          { executable: "pnpm", args: ["test"], clientSecret: "fake-secret" }
        ]
      },
      code: "CONFIG_SECRET_FIELD"
    }
  ])("拒绝$name", ({ input, code }) => {
    const result = parseHarnessConfig(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
      expect(result.error.message).not.toContain("sk-fake-config-secret");
      expect(result.error.message).not.toContain("fake-secret");
    }
  });
});
