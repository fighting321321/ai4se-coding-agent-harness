import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseHarnessConfig, type HarnessConfig } from "./config.js";
import { validProviderBaseUrl } from "./openai-compatible-provider.js";
import {
  WindowsUserCredentialVault,
  type SystemCredentialVault
} from "./system-credential-vault.js";

export type FirstRunField = "baseUrl" | "apiKey" | "model";

export interface FirstRunInput {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export type FirstRunValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly field: FirstRunField; readonly message: string } };

export type FirstRunInputValidator = (
  input: FirstRunInput
) => Promise<FirstRunValidationResult> | FirstRunValidationResult;

export type SystemCredentialVaultFactory = (path: string) => SystemCredentialVault;

export interface FirstRunOptions {
  readonly cwd: string;
}

export interface FirstRunDependencies {
  readonly readLine: (prompt: string) => Promise<string | undefined>;
  readonly readSecret: (prompt: string) => Promise<string>;
  readonly systemCredentialVaultFactory?: SystemCredentialVaultFactory;
  readonly validateInput?: FirstRunInputValidator;
  readonly writeConfig?: (path: string, config: HarnessConfig) => Promise<void>;
}

export type FirstRunResult =
  | { readonly ok: true; readonly value: { readonly initialized: boolean } }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | "FIRST_RUN_INPUT_CANCELLED"
          | "FIRST_RUN_INPUT_INVALID"
          | "FIRST_RUN_CONFIG_INVALID"
          | "FIRST_RUN_SYSTEM_CREDENTIAL_FAILED"
          | "FIRST_RUN_STORAGE_FAILED";
        readonly field?: FirstRunField;
        readonly message: string;
      };
    };

const DEFAULT_CONFIG = {
  workspace: ".",
  allowedCommands: [],
  maxSteps: 8,
  commandTimeoutMs: 60_000,
  maxOutputBytes: 32_768,
  memoryPath: ".ai4se/memory.json"
} as const;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

async function configStatus(path: string): Promise<"configured" | "unconfigured" | "invalid"> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return parseHarnessConfig(parsed).ok ? "configured" : "invalid";
  } catch (error) {
    return errorCode(error) === "ENOENT" ? "unconfigured" : "invalid";
  }
}

export const validateFirstRunInput: FirstRunInputValidator = (input) => {
  if (
    input.baseUrl.length > 2_048 ||
    input.baseUrl !== input.baseUrl.trim() ||
    !validProviderBaseUrl(input.baseUrl)
  ) {
    return { ok: false, error: { field: "baseUrl", message: "服务地址无效" } };
  }
  if (input.apiKey.length === 0 || input.apiKey !== input.apiKey.trim()) {
    return { ok: false, error: { field: "apiKey", message: "API Key 无效" } };
  }
  if (
    input.model.length > 200 ||
    input.model.length === 0 ||
    input.model !== input.model.trim() ||
    /\p{C}/u.test(input.model)
  ) {
    return { ok: false, error: { field: "model", message: "模型名称无效" } };
  }
  return { ok: true };
};

async function atomicWriteConfig(path: string, config: HarnessConfig): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // 临时文件可能尚未创建；保留原始错误。
    }
    throw error;
  }
}

function failure(
  code: Extract<FirstRunResult, { ok: false }>["error"]["code"],
  message: string,
  field?: FirstRunField
): FirstRunResult {
  return field === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, field, message } };
}

export async function initializeFirstRun(
  options: FirstRunOptions,
  dependencies: FirstRunDependencies
): Promise<FirstRunResult> {
  const configPath = join(options.cwd, ".ai4se", "config.json");
  const vaultPath = join(options.cwd, ".ai4se", "credentials.system.json");
  const vault = dependencies.systemCredentialVaultFactory?.(vaultPath)
    ?? new WindowsUserCredentialVault(vaultPath);
  const vaultStatus = await vault.status();
  if (!vaultStatus.ok) {
    return failure(
      "FIRST_RUN_SYSTEM_CREDENTIAL_FAILED",
      `系统凭据不可用：${vaultStatus.error.code}`
    );
  }
  const localConfigStatus = await configStatus(configPath);
  if (localConfigStatus === "invalid") {
    return failure("FIRST_RUN_CONFIG_INVALID", "现有配置无效，未执行初始化");
  }
  if (localConfigStatus === "configured" && vaultStatus.value === "configured") {
    return { ok: true, value: { initialized: false } };
  }

  const baseUrl = await dependencies.readLine("服务地址：");
  if (baseUrl === undefined) {
    return failure("FIRST_RUN_INPUT_CANCELLED", "首次初始化已取消", "baseUrl");
  }
  const apiKey = await dependencies.readSecret("API Key");
  const model = await dependencies.readLine("模型名称：");
  if (model === undefined) {
    return failure("FIRST_RUN_INPUT_CANCELLED", "首次初始化已取消", "model");
  }
  const input = { baseUrl, apiKey, model };
  const validation = await (dependencies.validateInput ?? validateFirstRunInput)(input);
  if (!validation.ok) {
    return failure(
      "FIRST_RUN_INPUT_INVALID",
      validation.error.message,
      validation.error.field
    );
  }

  let previousApiKey: string | undefined;
  if (vaultStatus.value === "configured") {
    const previous = await vault.read();
    if (!previous.ok) {
      return failure(
        "FIRST_RUN_SYSTEM_CREDENTIAL_FAILED",
        `系统凭据读取失败：${previous.error.code}`
      );
    }
    previousApiKey = previous.value;
  }
  const stored = previousApiKey === undefined
    ? await vault.init(apiKey)
    : await vault.update(apiKey);
  if (!stored.ok) {
    return failure(
      "FIRST_RUN_SYSTEM_CREDENTIAL_FAILED",
      `系统凭据保存失败：${stored.error.code}`
    );
  }

  const config: HarnessConfig = {
    ...DEFAULT_CONFIG,
    provider: { baseUrl, model }
  };
  try {
    await (dependencies.writeConfig ?? atomicWriteConfig)(configPath, config);
  } catch {
    const rolledBack = previousApiKey === undefined
      ? await vault.clear()
      : await vault.update(previousApiKey);
    return rolledBack.ok
      ? failure("FIRST_RUN_STORAGE_FAILED", "首次初始化保存失败，已回滚")
      : failure("FIRST_RUN_STORAGE_FAILED", "首次初始化保存失败且凭据回滚失败");
  }
  return { ok: true, value: { initialized: true } };
}
