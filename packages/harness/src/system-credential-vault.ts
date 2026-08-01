import { spawn } from "node:child_process";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
  type FileHandle
} from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { TextDecoder } from "node:util";

import type { CredentialStatus } from "./credential-store.js";

export type SystemCredentialErrorCode =
  | "SYSTEM_CREDENTIAL_INVALID_INPUT"
  | "SYSTEM_CREDENTIAL_NOT_CONFIGURED"
  | "SYSTEM_CREDENTIAL_ALREADY_CONFIGURED"
  | "SYSTEM_CREDENTIAL_UNSUPPORTED"
  | "SYSTEM_CREDENTIAL_CORRUPT"
  | "SYSTEM_CREDENTIAL_PROTECTION_FAILED"
  | "SYSTEM_CREDENTIAL_IO_ERROR";

export type SystemCredentialResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: { code: SystemCredentialErrorCode; message: string };
    };

export interface SystemCredentialVault {
  status(): Promise<SystemCredentialResult<CredentialStatus>>;
  init(apiKey: string): Promise<SystemCredentialResult<void>>;
  read(): Promise<SystemCredentialResult<string>>;
  update(apiKey: string): Promise<SystemCredentialResult<void>>;
  clear(): Promise<SystemCredentialResult<void>>;
}

export interface CredentialProtectionProcessRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly operation: "protect" | "unprotect";
  readonly input: string;
}

export interface CredentialProtectionProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
}

export type CredentialProtectionProcess = (
  request: CredentialProtectionProcessRequest
) => Promise<CredentialProtectionProcessResult>;

export interface SystemCredentialVaultFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  open(path: string, flags: "wx"): Promise<FileHandle>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
  writeFile(path: string, value: string, encoding: "utf8"): Promise<void>;
}

export interface WindowsUserCredentialVaultOptions {
  readonly platform?: NodeJS.Platform;
  readonly runProtectionProcess?: CredentialProtectionProcess;
  readonly fileSystem?: Partial<SystemCredentialVaultFileSystem>;
  readonly lockMaxAttempts?: number;
  readonly lockRetryDelayMs?: number;
}

interface VaultDocument {
  readonly version: 1;
  readonly protection: "windows-dpapi-current-user";
  readonly protectedValue: string;
}

type LoadedDocument =
  | { kind: "missing" }
  | { kind: "loaded"; document: VaultDocument }
  | { kind: "failure"; result: SystemCredentialResult<never> };

interface HeldLock {
  readonly handle: FileHandle;
  readonly owner: string;
}

const DEFAULT_FILE_SYSTEM: SystemCredentialVaultFileSystem = {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile
};

const POWERSHELL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $bytes = [Convert]::FromBase64String([string]$request.input)
  if ([string]$request.operation -eq 'protect') {
    $result = [System.Security.Cryptography.ProtectedData]::Protect(
      $bytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  } elseif ([string]$request.operation -eq 'unprotect') {
    $result = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $bytes,
      $null,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  } else {
    exit 1
  }
  [Console]::Out.Write([Convert]::ToBase64String($result))
} catch {
  exit 1
}`;

const POWERSHELL_COMMAND = "powershell.exe";
const POWERSHELL_ARGS = [
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  POWERSHELL_SCRIPT
] as const;
const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;

function failure<T>(
  code: SystemCredentialErrorCode,
  message: string
): SystemCredentialResult<T> {
  return { ok: false, error: { code, message } };
}

function unsupported<T>(): SystemCredentialResult<T> {
  return failure(
    "SYSTEM_CREDENTIAL_UNSUPPORTED",
    "当前平台不支持系统凭据保护"
  );
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function validApiKey(apiKey: string): boolean {
  return apiKey.trim().length > 0;
}

function decodeBase64(value: unknown): Buffer | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : undefined;
}

function parseDocument(source: string): VaultDocument | undefined {
  try {
    const value: unknown = JSON.parse(source);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return undefined;
    }
    const document = value as Record<string, unknown>;
    if (
      Object.keys(document).length !== 3 ||
      document.version !== 1 ||
      document.protection !== "windows-dpapi-current-user" ||
      decodeBase64(document.protectedValue) === undefined
    ) {
      return undefined;
    }
    return {
      version: 1,
      protection: "windows-dpapi-current-user",
      protectedValue: document.protectedValue as string
    };
  } catch {
    return undefined;
  }
}

function validPositiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? Math.min(value, 1_000)
    : fallback;
}

function validNonnegativeInteger(
  value: number | undefined,
  fallback: number
): number {
  return value !== undefined && Number.isInteger(value) && value >= 0
    ? Math.min(value, 1_000)
    : fallback;
}

export const runWindowsCredentialProtectionProcess: CredentialProtectionProcess =
  async (request) => await new Promise((resolve) => {
    const child = spawn(request.command, [...request.args], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true
    });
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (result: CredentialProtectionProcessResult): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    child.once("error", () => finish({ exitCode: 1, stdout: "" }));
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        chunks.length = 0;
        child.kill();
        return;
      }
      chunks.push(chunk);
    });
    child.once("close", (code) => {
      finish({
        exitCode: code === 0 && outputBytes <= MAX_PROCESS_OUTPUT_BYTES ? 0 : 1,
        stdout: outputBytes <= MAX_PROCESS_OUTPUT_BYTES
          ? Buffer.concat(chunks).toString("utf8")
          : ""
      });
    });
    child.stdin.on("error", () => {
      // 进程失败由 close/error 统一转换为不含底层细节的结果。
    });
    child.stdin.end(JSON.stringify({
      operation: request.operation,
      input: request.input
    }));
  });

export class WindowsUserCredentialVault implements SystemCredentialVault {
  readonly #path: string;
  readonly #lockPath: string;
  readonly #platform: NodeJS.Platform;
  readonly #runProtectionProcess: CredentialProtectionProcess;
  readonly #fileSystem: SystemCredentialVaultFileSystem;
  readonly #lockMaxAttempts: number;
  readonly #lockRetryDelayMs: number;

  constructor(path: string, options: WindowsUserCredentialVaultOptions = {}) {
    this.#path = path;
    this.#lockPath = `${path}.lock`;
    this.#platform = options.platform ?? process.platform;
    this.#runProtectionProcess = options.runProtectionProcess
      ?? runWindowsCredentialProtectionProcess;
    this.#fileSystem = { ...DEFAULT_FILE_SYSTEM, ...options.fileSystem };
    this.#lockMaxAttempts = validPositiveInteger(options.lockMaxAttempts, 100);
    this.#lockRetryDelayMs = validNonnegativeInteger(options.lockRetryDelayMs, 20);
  }

  #supported<T>(): SystemCredentialResult<T> | undefined {
    return this.#platform === "win32" ? undefined : unsupported();
  }

  async #load(): Promise<LoadedDocument> {
    let source: string;
    try {
      source = await this.#fileSystem.readFile(this.#path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return { kind: "missing" };
      }
      return {
        kind: "failure",
        result: failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法读取系统凭据")
      };
    }
    const document = parseDocument(source);
    return document === undefined
      ? {
          kind: "failure",
          result: failure(
            "SYSTEM_CREDENTIAL_CORRUPT",
            "系统凭据已损坏或格式无效"
          )
        }
      : { kind: "loaded", document };
  }

  async #transform(
    operation: "protect" | "unprotect",
    input: Buffer
  ): Promise<SystemCredentialResult<Buffer>> {
    let processResult: CredentialProtectionProcessResult;
    try {
      processResult = await this.#runProtectionProcess({
        command: POWERSHELL_COMMAND,
        args: POWERSHELL_ARGS,
        operation,
        input: input.toString("base64")
      });
    } catch {
      return failure(
        "SYSTEM_CREDENTIAL_PROTECTION_FAILED",
        "系统凭据保护操作失败"
      );
    }
    const output = processResult.exitCode === 0
      ? decodeBase64(processResult.stdout.trim())
      : undefined;
    return output === undefined
      ? failure(
          "SYSTEM_CREDENTIAL_PROTECTION_FAILED",
          "系统凭据保护操作失败"
        )
      : { ok: true, value: output };
  }

  async #protect(apiKey: string): Promise<SystemCredentialResult<VaultDocument>> {
    const plaintext = Buffer.from(apiKey, "utf8");
    try {
      const protectedValue = await this.#transform("protect", plaintext);
      return protectedValue.ok
        ? {
            ok: true,
            value: {
              version: 1,
              protection: "windows-dpapi-current-user",
              protectedValue: protectedValue.value.toString("base64")
            }
          }
        : protectedValue;
    } finally {
      plaintext.fill(0);
    }
  }

  async #atomicWrite(document: VaultDocument): Promise<void> {
    const temporaryPath = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    await this.#fileSystem.mkdir(dirname(this.#path), { recursive: true });
    try {
      await this.#fileSystem.writeFile(
        temporaryPath,
        `${JSON.stringify(document, null, 2)}\n`,
        "utf8"
      );
      await this.#fileSystem.rename(temporaryPath, this.#path);
    } catch (error) {
      try {
        await this.#fileSystem.unlink(temporaryPath);
      } catch {
        // 临时文件可能尚未创建；保留原始写入失败。
      }
      throw error;
    }
  }

  async #acquireLock(): Promise<SystemCredentialResult<HeldLock>> {
    try {
      await this.#fileSystem.mkdir(dirname(this.#lockPath), { recursive: true });
    } catch {
      return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法锁定系统凭据");
    }
    for (let attempt = 0; attempt < this.#lockMaxAttempts; attempt += 1) {
      let handle: FileHandle;
      try {
        handle = await this.#fileSystem.open(this.#lockPath, "wx");
      } catch (error) {
        if (
          errorCode(error) === "EEXIST" &&
          attempt + 1 < this.#lockMaxAttempts
        ) {
          await delay(this.#lockRetryDelayMs);
          continue;
        }
        return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法锁定系统凭据");
      }
      const owner = randomUUID();
      try {
        await handle.writeFile(owner, "utf8");
        return { ok: true, value: { handle, owner } };
      } catch {
        try {
          await handle.close();
        } catch {
          // 关闭错误不向外泄漏底层信息。
        }
        try {
          await this.#fileSystem.unlink(this.#lockPath);
        } catch {
          // 只尝试清理本次刚创建的锁文件。
        }
        return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法锁定系统凭据");
      }
    }
    return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法锁定系统凭据");
  }

  async #releaseLock(lock: HeldLock): Promise<boolean> {
    let closed = true;
    try {
      await lock.handle.close();
    } catch {
      closed = false;
    }
    try {
      const owner = await this.#fileSystem.readFile(this.#lockPath, "utf8");
      if (owner !== lock.owner) {
        return false;
      }
      await this.#fileSystem.unlink(this.#lockPath);
      return closed;
    } catch {
      return false;
    }
  }

  async #withMutationLock<T>(
    operation: () => Promise<SystemCredentialResult<T>>
  ): Promise<SystemCredentialResult<T>> {
    const acquired = await this.#acquireLock();
    if (!acquired.ok) {
      return acquired;
    }
    let result: SystemCredentialResult<T>;
    try {
      result = await operation();
    } catch {
      result = failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法修改系统凭据");
    }
    if (!(await this.#releaseLock(acquired.value))) {
      return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法释放系统凭据锁");
    }
    return result;
  }

  async status(): Promise<SystemCredentialResult<CredentialStatus>> {
    const unsupportedResult = this.#supported<CredentialStatus>();
    if (unsupportedResult !== undefined) {
      return unsupportedResult;
    }
    const loaded = await this.#load();
    if (loaded.kind === "failure") {
      return loaded.result;
    }
    return {
      ok: true,
      value: loaded.kind === "loaded" ? "configured" : "unconfigured"
    };
  }

  async init(apiKey: string): Promise<SystemCredentialResult<void>> {
    const unsupportedResult = this.#supported<void>();
    if (unsupportedResult !== undefined) {
      return unsupportedResult;
    }
    if (!validApiKey(apiKey)) {
      return failure("SYSTEM_CREDENTIAL_INVALID_INPUT", "系统凭据输入无效");
    }
    return await this.#withMutationLock(async () => {
      const loaded = await this.#load();
      if (loaded.kind === "failure") {
        return loaded.result;
      }
      if (loaded.kind === "loaded") {
        return failure(
          "SYSTEM_CREDENTIAL_ALREADY_CONFIGURED",
          "系统凭据已配置"
        );
      }
      const document = await this.#protect(apiKey);
      if (!document.ok) {
        return document;
      }
      try {
        await this.#atomicWrite(document.value);
        return { ok: true, value: undefined };
      } catch {
        return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法写入系统凭据");
      }
    });
  }

  async read(): Promise<SystemCredentialResult<string>> {
    const unsupportedResult = this.#supported<string>();
    if (unsupportedResult !== undefined) {
      return unsupportedResult;
    }
    const loaded = await this.#load();
    if (loaded.kind === "failure") {
      return loaded.result;
    }
    if (loaded.kind === "missing") {
      return failure("SYSTEM_CREDENTIAL_NOT_CONFIGURED", "系统凭据尚未配置");
    }
    const protectedBytes = Buffer.from(loaded.document.protectedValue, "base64");
    const plaintext = await this.#transform("unprotect", protectedBytes);
    if (!plaintext.ok) {
      return plaintext;
    }
    try {
      return {
        ok: true,
        value: new TextDecoder("utf-8", { fatal: true }).decode(plaintext.value)
      };
    } catch {
      return failure(
        "SYSTEM_CREDENTIAL_PROTECTION_FAILED",
        "系统凭据保护操作失败"
      );
    } finally {
      plaintext.value.fill(0);
    }
  }

  async update(apiKey: string): Promise<SystemCredentialResult<void>> {
    const unsupportedResult = this.#supported<void>();
    if (unsupportedResult !== undefined) {
      return unsupportedResult;
    }
    if (!validApiKey(apiKey)) {
      return failure("SYSTEM_CREDENTIAL_INVALID_INPUT", "系统凭据输入无效");
    }
    return await this.#withMutationLock(async () => {
      const loaded = await this.#load();
      if (loaded.kind === "failure") {
        return loaded.result;
      }
      if (loaded.kind === "missing") {
        return failure("SYSTEM_CREDENTIAL_NOT_CONFIGURED", "系统凭据尚未配置");
      }
      const document = await this.#protect(apiKey);
      if (!document.ok) {
        return document;
      }
      try {
        await this.#atomicWrite(document.value);
        return { ok: true, value: undefined };
      } catch {
        return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法更新系统凭据");
      }
    });
  }

  async clear(): Promise<SystemCredentialResult<void>> {
    const unsupportedResult = this.#supported<void>();
    if (unsupportedResult !== undefined) {
      return unsupportedResult;
    }
    return await this.#withMutationLock(async () => {
      const loaded = await this.#load();
      if (loaded.kind === "failure") {
        return loaded.result;
      }
      if (loaded.kind === "missing") {
        return failure("SYSTEM_CREDENTIAL_NOT_CONFIGURED", "系统凭据尚未配置");
      }
      try {
        await this.#fileSystem.unlink(this.#path);
        return { ok: true, value: undefined };
      } catch {
        return failure("SYSTEM_CREDENTIAL_IO_ERROR", "无法清除系统凭据");
      }
    });
  }
}
