import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseHarnessConfig } from "../../../packages/harness/src/index.js";

const validConfig = {
  workspace: "./workspace",
  allowedCommands: [{ executable: "pnpm", args: ["test"] }],
  maxSteps: 20,
  commandTimeoutMs: 120_000,
  maxOutputBytes: 64 * 1024,
  memoryPath: ".ai4se/memory.json",
  provider: {
    baseUrl: "https://provider.example/v1",
    model: "course-model"
  }
};

describe("parseHarnessConfig", () => {
  it("接受完整且严格的本地 Harness 配置", () => {
    const result = parseHarnessConfig(validConfig);

    expect(result).toEqual({ ok: true, value: validConfig });
  });

  it("接受可选的确定性上下文字符预算", () => {
    const input = { ...validConfig, contextBudgetChars: 24_000 };

    expect(parseHarnessConfig(input)).toEqual({ ok: true, value: input });
  });

  it.each([
    "https://provider.example/v1",
    "http://localhost:11434/v1",
    "http://127.0.0.1:11434/v1",
    "http://[::1]:11434/v1"
  ])("接受 HTTPS 或本机回环 HTTP Provider base URL：%s", (baseUrl) => {
    const input = {
      ...validConfig,
      provider: { ...validConfig.provider, baseUrl }
    };

    expect(parseHarnessConfig(input)).toEqual({ ok: true, value: input });
  });

  it.each([
    "http://provider.example/v1",
    "http://192.0.2.1:11434/v1"
  ])("拒绝非本机 HTTP Provider base URL 且错误不包含 URL：%s", (baseUrl) => {
    const result = parseHarnessConfig({
      ...validConfig,
      provider: { ...validConfig.provider, baseUrl }
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFIG_INVALID_VALUE" }
    });
    expect(JSON.stringify(result)).not.toContain(baseUrl);
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
      name: "Provider 中的未知字段",
      input: {
        ...validConfig,
        provider: { ...validConfig.provider, organization: "example" }
      },
      code: "CONFIG_UNKNOWN_FIELD"
    },
    {
      name: "相对 Provider base URL",
      input: {
        ...validConfig,
        provider: { ...validConfig.provider, baseUrl: "/v1" }
      },
      code: "CONFIG_INVALID_VALUE"
    },
    {
      name: "非 HTTP Provider base URL",
      input: {
        ...validConfig,
        provider: { ...validConfig.provider, baseUrl: "ftp://provider.example" }
      },
      code: "CONFIG_INVALID_VALUE"
    },
    {
      name: "空白 Provider model",
      input: {
        ...validConfig,
        provider: { ...validConfig.provider, model: "   " }
      },
      code: "CONFIG_INVALID_VALUE"
    },
    {
      name: "越界的最大步数",
      input: { ...validConfig, maxSteps: 0 },
      code: "CONFIG_INVALID_VALUE"
    },
    {
      name: "过小的上下文预算",
      input: { ...validConfig, contextBudgetChars: 255 },
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
    },
    {
      name: "合法字段中隐藏的 API Key 值",
      input: {
        ...validConfig,
        allowedCommands: [
          { executable: "tool", args: ["--token", "sk-fake-config-secret"] }
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

  it.each(["apiKey", "key", "secret", "token"])(
    "明确拒绝 Provider 内的敏感字段 %s",
    (field) => {
      const result = parseHarnessConfig({
        ...validConfig,
        provider: { ...validConfig.provider, [field]: "sensitive-value" }
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "CONFIG_SECRET_FIELD" }
      });
      expect(JSON.stringify(result)).not.toContain("sensitive-value");
    }
  );
});
