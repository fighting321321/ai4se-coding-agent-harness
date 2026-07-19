import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scrypt
} from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

export type CredentialStatus = "configured" | "unconfigured";

export type CredentialErrorCode =
  | "CREDENTIAL_NOT_CONFIGURED"
  | "CREDENTIAL_ALREADY_CONFIGURED"
  | "CREDENTIAL_AUTH_FAILED"
  | "CREDENTIAL_CORRUPT"
  | "CREDENTIAL_IO_ERROR";

export type CredentialResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: CredentialErrorCode; message: string } };

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

const deriveKey = promisify(scrypt);

function failure<T>(
  code: CredentialErrorCode,
  message: string
): CredentialResult<T> {
  return { ok: false, error: { code, message } };
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
  return (await deriveKey(masterPassword, salt, 32)) as Buffer;
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

async function atomicWrite(path: string, document: CredentialDocument): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // 临时文件可能尚未创建，原始写入错误应优先返回。
    }
    throw error;
  }
}

export class CredentialStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async #load(): Promise<LoadedDocument> {
    let source: string;
    try {
      source = await readFile(this.#path, "utf8");
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
    const loaded = await this.#load();
    if (loaded.kind === "failure") {
      return loaded.result;
    }
    if (loaded.kind === "loaded") {
      return failure("CREDENTIAL_ALREADY_CONFIGURED", "凭据已配置");
    }

    try {
      await atomicWrite(this.#path, await encrypt(masterPassword, apiKey));
      return { ok: true, value: undefined };
    } catch {
      return failure("CREDENTIAL_IO_ERROR", "无法写入凭据文件");
    }
  }

  async read(masterPassword: string): Promise<CredentialResult<string>> {
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
      await atomicWrite(this.#path, await encrypt(masterPassword, apiKey));
      return { ok: true, value: undefined };
    } catch {
      return failure("CREDENTIAL_IO_ERROR", "无法更新凭据文件");
    }
  }

  async clear(masterPassword: string): Promise<CredentialResult<void>> {
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
      await unlink(this.#path);
      return { ok: true, value: undefined };
    } catch {
      return failure("CREDENTIAL_IO_ERROR", "无法清除凭据文件");
    }
  }
}
