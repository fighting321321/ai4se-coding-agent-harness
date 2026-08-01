import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scrypt
} from "node:crypto";
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
import { setTimeout as delay } from "node:timers/promises";

export type CredentialStatus = "configured" | "unconfigured";

export type CredentialErrorCode =
  | "CREDENTIAL_INVALID_INPUT"
  | "CREDENTIAL_NOT_CONFIGURED"
  | "CREDENTIAL_ALREADY_CONFIGURED"
  | "CREDENTIAL_AUTH_FAILED"
  | "CREDENTIAL_CORRUPT"
  | "CREDENTIAL_IO_ERROR";

export type CredentialResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: CredentialErrorCode; message: string } };

export interface CredentialStoreFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  open(path: string, flags: "wx"): Promise<FileHandle>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  rename(source: string, destination: string): Promise<void>;
  unlink(path: string): Promise<void>;
  writeFile(path: string, value: string, encoding: "utf8"): Promise<void>;
}

export interface CredentialStoreOptions {
  fileSystem?: Partial<CredentialStoreFileSystem>;
  lockMaxAttempts?: number;
  lockRetryDelayMs?: number;
}

export interface CredentialStoreBoundary {
  status(): Promise<CredentialResult<CredentialStatus>>;
  init(masterPassword: string, apiKey: string): Promise<CredentialResult<void>>;
  read(masterPassword: string): Promise<CredentialResult<string>>;
  update(masterPassword: string, apiKey: string): Promise<CredentialResult<void>>;
  clear(masterPassword: string): Promise<CredentialResult<void>>;
}

export type CredentialStoreFactory = (path: string) => CredentialStoreBoundary;

interface CredentialDocument {
  version: 1;
  salt: string;
  nonce: string;
  tag: string;
  ciphertext: string;
}

type LoadedDocument =
  | { kind: "missing" }
  | { kind: "loaded"; document: CredentialDocument }
  | { kind: "failure"; result: CredentialResult<never> };

interface HeldLock {
  handle: FileHandle;
  owner: string;
}

const DEFAULT_FILE_SYSTEM: CredentialStoreFileSystem = {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile
};

const SCRYPT_OPTIONS = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024
} as const;

function failure<T>(
  code: CredentialErrorCode,
  message: string
): CredentialResult<T> {
  return { ok: false, error: { code, message } };
}

function validMasterPassword(masterPassword: string): boolean {
  return masterPassword.trim().length >= 12;
}

function validApiKey(apiKey: string): boolean {
  return apiKey.trim().length > 0;
}

function invalidInput<T>(): CredentialResult<T> {
  return failure("CREDENTIAL_INVALID_INPUT", "凭据输入无效");
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBase64(value: unknown, length?: number): Buffer | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (length !== undefined && decoded.length !== length)) {
    return undefined;
  }
  return decoded;
}

function parseDocument(source: string): CredentialDocument | undefined {
  try {
    const value: unknown = JSON.parse(source);
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 5 ||
      !Object.keys(value).every((field) =>
        ["version", "salt", "nonce", "tag", "ciphertext"].includes(field)
      ) ||
      value.version !== 1 ||
      decodeBase64(value.salt, 16) === undefined ||
      decodeBase64(value.nonce, 12) === undefined ||
      decodeBase64(value.tag, 16) === undefined ||
      decodeBase64(value.ciphertext) === undefined
    ) {
      return undefined;
    }
    return {
      version: 1,
      salt: value.salt as string,
      nonce: value.nonce as string,
      tag: value.tag as string,
      ciphertext: value.ciphertext as string
    };
  } catch {
    return undefined;
  }
}

async function keyFromPassword(masterPassword: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(masterPassword, salt, 32, SCRYPT_OPTIONS, (error, key) => {
      if (error === null) {
        resolve(key);
      } else {
        reject(error);
      }
    });
  });
}

async function encrypt(
  masterPassword: string,
  apiKey: string
): Promise<CredentialDocument> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await keyFromPassword(masterPassword, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(apiKey, "utf8"),
      cipher.final()
    ]);
    return {
      version: 1,
      salt: salt.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64")
    };
  } finally {
    key.fill(0);
  }
}

async function decrypt(
  masterPassword: string,
  document: CredentialDocument
): Promise<CredentialResult<string>> {
  const salt = Buffer.from(document.salt, "base64");
  const nonce = Buffer.from(document.nonce, "base64");
  const key = await keyFromPassword(masterPassword, salt);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(Buffer.from(document.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(document.ciphertext, "base64")),
      decipher.final()
    ]);
    return { ok: true, value: plaintext.toString("utf8") };
  } catch {
    return failure("CREDENTIAL_AUTH_FAILED", "凭据认证失败");
  } finally {
    key.fill(0);
  }
}

async function atomicWrite(
  fileSystem: CredentialStoreFileSystem,
  path: string,
  document: CredentialDocument
): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await fileSystem.mkdir(dirname(path), { recursive: true });
  try {
    await fileSystem.writeFile(
      temporaryPath,
      `${JSON.stringify(document, null, 2)}\n`,
      "utf8"
    );
    await fileSystem.rename(temporaryPath, path);
  } catch (error) {
    try {
      await fileSystem.unlink(temporaryPath);
    } catch {
      // 临时文件可能尚未创建，原始写入错误应优先返回。
    }
    throw error;
  }
}

export class CredentialStore implements CredentialStoreBoundary {
  readonly #path: string;
  readonly #lockPath: string;
  readonly #fileSystem: CredentialStoreFileSystem;
  readonly #lockMaxAttempts: number;
  readonly #lockRetryDelayMs: number;

  constructor(path: string, options: CredentialStoreOptions = {}) {
    this.#path = path;
    this.#lockPath = `${path}.lock`;
    this.#fileSystem = { ...DEFAULT_FILE_SYSTEM, ...options.fileSystem };
    this.#lockMaxAttempts = validPositiveInteger(options.lockMaxAttempts, 100);
    this.#lockRetryDelayMs = validNonnegativeInteger(options.lockRetryDelayMs, 20);
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
        result: failure("CREDENTIAL_IO_ERROR", "无法读取凭据文件")
      };
    }

    const document = parseDocument(source);
    if (document === undefined) {
      return {
        kind: "failure",
        result: failure("CREDENTIAL_CORRUPT", "凭据文件已损坏或结构无效")
      };
    }
    return { kind: "loaded", document };
  }

  async #acquireLock(): Promise<CredentialResult<HeldLock>> {
    try {
      await this.#fileSystem.mkdir(dirname(this.#lockPath), { recursive: true });
    } catch {
      return failure("CREDENTIAL_IO_ERROR", "无法获得凭据文件锁");
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
        return failure("CREDENTIAL_IO_ERROR", "无法获得凭据文件锁");
      }

      const owner = randomUUID();
      try {
        await handle.writeFile(owner, "utf8");
        return { ok: true, value: { handle, owner } };
      } catch {
        try {
          await handle.close();
        } catch {
          // 锁句柄关闭错误不应泄露底层信息。
        }
        try {
          await this.#fileSystem.unlink(this.#lockPath);
        } catch {
          // 仅尝试清理本调用刚创建的锁文件。
        }
        return failure("CREDENTIAL_IO_ERROR", "无法获得凭据文件锁");
      }
    }

    return failure("CREDENTIAL_IO_ERROR", "无法获得凭据文件锁");
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
    operation: () => Promise<CredentialResult<T>>
  ): Promise<CredentialResult<T>> {
    const acquired = await this.#acquireLock();
    if (!acquired.ok) {
      return acquired;
    }

    let result: CredentialResult<T>;
    try {
      result = await operation();
    } catch {
      result = failure("CREDENTIAL_IO_ERROR", "无法修改凭据文件");
    }
    if (!(await this.#releaseLock(acquired.value))) {
      return failure("CREDENTIAL_IO_ERROR", "无法释放凭据文件锁");
    }
    return result;
  }

  async status(): Promise<CredentialResult<CredentialStatus>> {
    const loaded = await this.#load();
    if (loaded.kind === "failure") {
      return loaded.result;
    }
    return {
      ok: true,
      value: loaded.kind === "loaded" ? "configured" : "unconfigured"
    };
  }

  async init(masterPassword: string, apiKey: string): Promise<CredentialResult<void>> {
    if (!validMasterPassword(masterPassword) || !validApiKey(apiKey)) {
      return invalidInput();
    }
    return await this.#withMutationLock(async () => {
      const loaded = await this.#load();
      if (loaded.kind === "failure") {
        return loaded.result;
      }
      if (loaded.kind === "loaded") {
        return failure("CREDENTIAL_ALREADY_CONFIGURED", "凭据已配置");
      }

      try {
        await atomicWrite(
          this.#fileSystem,
          this.#path,
          await encrypt(masterPassword, apiKey)
        );
        return { ok: true, value: undefined };
      } catch {
        return failure("CREDENTIAL_IO_ERROR", "无法写入凭据文件");
      }
    });
  }

  async read(masterPassword: string): Promise<CredentialResult<string>> {
    if (!validMasterPassword(masterPassword)) {
      return invalidInput();
    }
    const loaded = await this.#load();
    if (loaded.kind === "failure") {
      return loaded.result;
    }
    if (loaded.kind === "missing") {
      return failure("CREDENTIAL_NOT_CONFIGURED", "凭据尚未配置");
    }
    try {
      return await decrypt(masterPassword, loaded.document);
    } catch {
      return failure("CREDENTIAL_IO_ERROR", "无法读取凭据文件");
    }
  }

  async update(
    masterPassword: string,
    apiKey: string
  ): Promise<CredentialResult<void>> {
    if (!validMasterPassword(masterPassword) || !validApiKey(apiKey)) {
      return invalidInput();
    }
    return await this.#withMutationLock(async () => {
      const loaded = await this.#load();
      if (loaded.kind === "failure") {
        return loaded.result;
      }
      if (loaded.kind === "missing") {
        return failure("CREDENTIAL_NOT_CONFIGURED", "凭据尚未配置");
      }

      try {
        const authenticated = await decrypt(masterPassword, loaded.document);
        if (!authenticated.ok) {
          return authenticated;
        }
        await atomicWrite(
          this.#fileSystem,
          this.#path,
          await encrypt(masterPassword, apiKey)
        );
        return { ok: true, value: undefined };
      } catch {
        return failure("CREDENTIAL_IO_ERROR", "无法更新凭据文件");
      }
    });
  }

  async clear(masterPassword: string): Promise<CredentialResult<void>> {
    if (!validMasterPassword(masterPassword)) {
      return invalidInput();
    }
    return await this.#withMutationLock(async () => {
      const loaded = await this.#load();
      if (loaded.kind === "failure") {
        return loaded.result;
      }
      if (loaded.kind === "missing") {
        return failure("CREDENTIAL_NOT_CONFIGURED", "凭据尚未配置");
      }

      try {
        const authenticated = await decrypt(masterPassword, loaded.document);
        if (!authenticated.ok) {
          return authenticated;
        }
        await this.#fileSystem.unlink(this.#path);
        return { ok: true, value: undefined };
      } catch {
        return failure("CREDENTIAL_IO_ERROR", "无法清除凭据文件");
      }
    });
  }
}

function validPositiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? Math.min(value, 1_000)
    : fallback;
}

function validNonnegativeInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value >= 0
    ? Math.min(value, 1_000)
    : fallback;
}
