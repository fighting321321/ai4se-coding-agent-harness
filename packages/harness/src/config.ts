import { isAbsolute } from "node:path";

import type { CommandRule } from "./command-rule.js";
import { validProviderBaseUrl } from "./openai-compatible-provider.js";
import { Redactor } from "./redactor.js";

export interface HarnessConfig {
  workspace: string;
  allowedCommands: readonly CommandRule[];
  maxSteps: number;
  commandTimeoutMs: number;
  maxOutputBytes: number;
  contextBudgetChars?: number;
  memoryPath: string;
  provider: {
    baseUrl: string;
    model: string;
  };
}

export type ConfigErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_UNKNOWN_FIELD"
  | "CONFIG_SECRET_FIELD"
  | "CONFIG_INVALID_VALUE"
  | "CONFIG_STORAGE_PATH_INVALID";

export type ConfigParseResult =
  | { ok: true; value: HarnessConfig }
  | { ok: false; error: { code: ConfigErrorCode; message: string } };

export function validModelName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value === value.trim() &&
    !/\p{C}/u.test(value)
  );
}

const CONFIG_FIELDS = new Set([
  "workspace",
  "allowedCommands",
  "maxSteps",
  "commandTimeoutMs",
  "maxOutputBytes",
  "contextBudgetChars",
  "memoryPath",
  "provider"
]);

const COMMAND_FIELDS = new Set(["executable", "args"]);
const PROVIDER_FIELDS = new Set(["baseUrl", "model"]);

function failure(code: ConfigErrorCode, message: string): ConfigParseResult {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSecretField(field: string): boolean {
  const normalized = field.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return /^(?:(?:api|access|auth|client|private)?(?:key|secret|token)|password|credentials?)s?$/u.test(
    normalized
  );
}

function findSecretField(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSecretField(item);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const [field, item] of Object.entries(value)) {
    if (isSecretField(field)) {
      return field;
    }
    const found = findSecretField(item);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function unknownField(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>
): string | undefined {
  return Object.keys(value).find((field) => !allowedFields.has(field));
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validStoragePath(path: unknown): path is string {
  if (
    typeof path !== "string" ||
    path.trim().length === 0 ||
    path.includes("\0") ||
    isAbsolute(path) ||
    /^[a-z]:/iu.test(path)
  ) {
    return false;
  }

  return !path.split(/[\\/]+/u).includes("..");
}

function parseCommandRules(value: unknown): readonly CommandRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const rules: CommandRule[] = [];
  for (const rule of value) {
    if (!isRecord(rule) || unknownField(rule, COMMAND_FIELDS) !== undefined) {
      return undefined;
    }
    if (
      typeof rule.executable !== "string" ||
      rule.executable.length === 0 ||
      rule.executable.includes("\0") ||
      !Array.isArray(rule.args) ||
      !rule.args.every((argument) => typeof argument === "string" && !argument.includes("\0"))
    ) {
      return undefined;
    }
    rules.push({ executable: rule.executable, args: [...rule.args] as string[] });
  }
  return rules;
}

export function parseHarnessConfig(input: unknown): ConfigParseResult {
  const secretField = findSecretField(input);
  if (secretField !== undefined) {
    return failure("CONFIG_SECRET_FIELD", `配置不得包含敏感字段：${secretField}`);
  }
  if (new Redactor().containsSensitive(input)) {
    return failure("CONFIG_SECRET_FIELD", "配置不得包含 API Key 或其他凭据值");
  }

  if (!isRecord(input)) {
    return failure("CONFIG_INVALID", "配置必须是对象");
  }

  const extraField = unknownField(input, CONFIG_FIELDS);
  if (extraField !== undefined) {
    return failure("CONFIG_UNKNOWN_FIELD", `配置包含未知字段：${extraField}`);
  }

  if (Array.isArray(input.allowedCommands)) {
    for (const rule of input.allowedCommands) {
      if (isRecord(rule)) {
        const extraCommandField = unknownField(rule, COMMAND_FIELDS);
        if (extraCommandField !== undefined) {
          return failure(
            "CONFIG_UNKNOWN_FIELD",
            `命令规则包含未知字段：${extraCommandField}`
          );
        }
      }
    }
  }

  if (isRecord(input.provider)) {
    const extraProviderField = unknownField(input.provider, PROVIDER_FIELDS);
    if (extraProviderField !== undefined) {
      return failure(
        "CONFIG_UNKNOWN_FIELD",
        `Provider 配置包含未知字段：${extraProviderField}`
      );
    }
  }

  const allowedCommands = parseCommandRules(input.allowedCommands);
  if (
    typeof input.workspace !== "string" ||
    input.workspace.trim().length === 0 ||
    input.workspace.includes("\0") ||
    allowedCommands === undefined ||
    !isRecord(input.provider) ||
    !validProviderBaseUrl(input.provider.baseUrl) ||
    !validModelName(input.provider.model)
  ) {
    return failure("CONFIG_INVALID_VALUE", "workspace、命令规则或 Provider 配置无效");
  }

  if (
    !isIntegerInRange(input.maxSteps, 1, 1_000) ||
    !isIntegerInRange(input.commandTimeoutMs, 1, 600_000) ||
    !isIntegerInRange(input.maxOutputBytes, 1, 10 * 1024 * 1024)
  ) {
    return failure("CONFIG_INVALID_VALUE", "配置数值超出允许范围");
  }
  if (
    input.contextBudgetChars !== undefined &&
    !isIntegerInRange(input.contextBudgetChars, 256, 10 * 1024 * 1024)
  ) {
    return failure("CONFIG_INVALID_VALUE", "上下文预算超出允许范围");
  }

  if (!validStoragePath(input.memoryPath)) {
    return failure(
      "CONFIG_STORAGE_PATH_INVALID",
      "Memory 路径必须是 workspace 内的非逃逸相对路径"
    );
  }

  return {
    ok: true,
    value: {
      workspace: input.workspace,
      allowedCommands,
      maxSteps: input.maxSteps,
      commandTimeoutMs: input.commandTimeoutMs,
      maxOutputBytes: input.maxOutputBytes,
      ...(input.contextBudgetChars === undefined
        ? {}
        : { contextBudgetChars: input.contextBudgetChars }),
      memoryPath: input.memoryPath,
      provider: {
        baseUrl: input.provider.baseUrl,
        model: input.provider.model
      }
    }
  };
}
