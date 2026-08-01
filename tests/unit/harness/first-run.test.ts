import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  initializeFirstRun,
  type FirstRunInputValidator,
  type SystemCredentialVault
} from "../../../packages/harness/src/index.js";

function memoryVault(): SystemCredentialVault {
  let value: string | undefined;
  return {
    status: async () => ({ ok: true, value: value === undefined ? "unconfigured" : "configured" }),
    init: async (apiKey) => {
      if (value !== undefined) {
        return { ok: false, error: { code: "SYSTEM_CREDENTIAL_ALREADY_CONFIGURED", message: "configured" } };
      }
      value = apiKey;
      return { ok: true, value: undefined };
    },
    read: async () => value === undefined
      ? { ok: false, error: { code: "SYSTEM_CREDENTIAL_NOT_CONFIGURED", message: "missing" } }
      : { ok: true, value },
    update: async (apiKey) => {
      if (value === undefined) {
        return { ok: false, error: { code: "SYSTEM_CREDENTIAL_NOT_CONFIGURED", message: "missing" } };
      }
      value = apiKey;
      return { ok: true, value: undefined };
    },
    clear: async () => {
      value = undefined;
      return { ok: true, value: undefined };
    }
  };
}

async function workspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ai4se-first-run-"));
}

describe("initializeFirstRun", () => {
  it("只按服务地址、隐藏 API Key、模型名称的顺序初始化当前目录", async () => {
    const cwd = await workspace();
    const vault = memoryVault();
    const prompts: string[] = [];
    const values = ["https://provider.example/v1", "model-name"];
    const readLine = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return values.shift();
    });
    const readSecret = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return "test-first-run-key";
    });

    const result = await initializeFirstRun({ cwd }, {
      readLine,
      readSecret,
      systemCredentialVaultFactory: () => vault
    });

    expect(result).toEqual({ ok: true, value: { initialized: true } });
    expect(prompts).toEqual(["服务地址：", "API Key", "模型名称："]);
    const config = await readFile(join(cwd, ".ai4se", "config.json"), "utf8");
    expect(JSON.parse(config)).toMatchObject({
      workspace: ".",
      memoryPath: ".ai4se/memory.json",
      provider: { baseUrl: "https://provider.example/v1", model: "model-name" }
    });
    expect(config).not.toContain("test-first-run-key");
    await expect(vault.read()).resolves.toEqual({ ok: true, value: "test-first-run-key" });
  });

  it("第二次启动配置和 vault 均完整时零重复输入", async () => {
    const cwd = await workspace();
    const vault = memoryVault();
    const firstLines = ["https://provider.example/v1", "model-name"];
    await initializeFirstRun({ cwd }, {
      readLine: async () => firstLines.shift(),
      readSecret: async () => "test-persisted-key",
      systemCredentialVaultFactory: () => vault
    });
    const readLine = vi.fn();
    const readSecret = vi.fn();

    const result = await initializeFirstRun({ cwd }, {
      readLine,
      readSecret,
      systemCredentialVaultFactory: () => vault
    });

    expect(result).toEqual({ ok: true, value: { initialized: false } });
    expect(readLine).not.toHaveBeenCalled();
    expect(readSecret).not.toHaveBeenCalled();
  });

  it("可注入校验失败时不留下半配置或凭据", async () => {
    const cwd = await workspace();
    const vault = memoryVault();
    const validator: FirstRunInputValidator = vi.fn(async () => ({
      ok: false,
      error: { field: "model", message: "模型名称无效" }
    } as const));
    const lines = ["https://provider.example/v1", "bad-model"];

    const result = await initializeFirstRun({ cwd }, {
      readLine: async () => lines.shift(),
      readSecret: async () => "test-rejected-key",
      systemCredentialVaultFactory: () => vault,
      validateInput: validator
    });

    expect(result).toMatchObject({ ok: false, error: { code: "FIRST_RUN_INPUT_INVALID", field: "model" } });
    await expect(access(join(cwd, ".ai4se", "config.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(vault.status()).resolves.toEqual({ ok: true, value: "unconfigured" });
    expect(JSON.stringify(result)).not.toContain("test-rejected-key");
  });

  it("配置写入失败时回滚刚写入的 vault", async () => {
    const cwd = await workspace();
    const vault = memoryVault();
    const lines = ["https://provider.example/v1", "model-name"];

    const result = await initializeFirstRun({ cwd }, {
      readLine: async () => lines.shift(),
      readSecret: async () => "test-rollback-key",
      systemCredentialVaultFactory: () => vault,
      writeConfig: async () => { throw new Error("simulated write failure"); }
    });

    expect(result).toMatchObject({ ok: false, error: { code: "FIRST_RUN_STORAGE_FAILED" } });
    await expect(vault.status()).resolves.toEqual({ ok: true, value: "unconfigured" });
    await expect(access(join(cwd, ".ai4se", "config.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.stringify(result)).not.toContain("test-rollback-key");
  });
});
