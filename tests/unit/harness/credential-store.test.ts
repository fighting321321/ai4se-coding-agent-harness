import { createDecipheriv, scrypt } from "node:crypto";
import {
  access,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import {
  CredentialStore,
  type CredentialStoreFileSystem
} from "../../../packages/harness/src/index.js";

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.()
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

async function deriveVersionOneKey(password: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => {
        if (error === null) {
          resolve(key);
        } else {
          reject(error);
        }
      }
    );
  });
}

function contentionOpen(signal: Deferred): CredentialStoreFileSystem["open"] {
  return async (path, flags) => {
    try {
      return await open(path, flags);
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        signal.resolve();
      }
      throw error;
    }
  };
}

async function credentialPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-credential-"));
  return join(directory, "credentials.json");
}

async function credentialPathInMissingDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-credential-input-"));
  return join(directory, "missing", "credentials.json");
}

function replaceBase64Byte(source: string): string {
  const bytes = Buffer.from(source, "base64");
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return bytes.toString("base64");
}

describe("CredentialStore", () => {
  it.each(["", "short", "            "])(
    "init 在加锁前拒绝无效主密码且不创建目录：%j",
    async (masterPassword) => {
      const path = await credentialPathInMissingDirectory();

      const result = await new CredentialStore(path).init(
        masterPassword,
        "sk-valid-input-test"
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: "CREDENTIAL_INVALID_INPUT",
          message: "凭据输入无效"
        }
      });
      await expect(access(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
    }
  );

  it("init 在加锁前拒绝空白 API Key 且不创建目录", async () => {
    const path = await credentialPathInMissingDirectory();

    const result = await new CredentialStore(path).init(
      "valid-master-password",
      "  \t  "
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_INVALID_INPUT" }
    });
    await expect(access(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["read", "update", "clear"] as const)(
    "%s 拒绝无效主密码并保持凭据文件不变",
    async (operation) => {
      const path = await credentialPath();
      const store = new CredentialStore(path);
      await store.init("valid-master-password", "sk-original-input-test");
      const original = await readFile(path, "utf8");

      const result = operation === "read"
        ? await store.read(" short ")
        : operation === "update"
          ? await store.update(" short ", "sk-replacement-input-test")
          : await store.clear(" short ");

      expect(result).toMatchObject({
        ok: false,
        error: { code: "CREDENTIAL_INVALID_INPUT" }
      });
      expect(JSON.stringify(result)).not.toContain("short");
      await expect(readFile(path, "utf8")).resolves.toBe(original);
    }
  );

  it("update 在修改前拒绝空白 API Key 并保持凭据文件不变", async () => {
    const path = await credentialPath();
    const store = new CredentialStore(path);
    await store.init("valid-master-password", "sk-original-input-test");
    const original = await readFile(path, "utf8");

    const result = await store.update("valid-master-password", "   ");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_INVALID_INPUT" }
    });
    await expect(readFile(path, "utf8")).resolves.toBe(original);
  });

  it("只验证秘密的去空白值并保留有效秘密的原始字节", async () => {
    const path = await credentialPath();
    const store = new CredentialStore(path);
    const masterPassword = "  preserve-master-password  ";
    const apiKey = "  sk-preserve-api-key  ";

    await expect(store.init(masterPassword, apiKey)).resolves.toEqual({
      ok: true,
      value: undefined
    });
    await expect(store.read(masterPassword)).resolves.toEqual({
      ok: true,
      value: apiKey
    });
    await expect(store.read(masterPassword.trim())).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_AUTH_FAILED" }
    });
  });

  it("把不存在的凭据文件报告为未配置", async () => {
    const store = new CredentialStore(await credentialPath());

    await expect(store.status()).resolves.toEqual({
      ok: true,
      value: "unconfigured"
    });
    await expect(store.read("missing-master-password")).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_NOT_CONFIGURED" }
    });
    await expect(
      store.update("missing-master-password", "sk-missing-api-key")
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_NOT_CONFIGURED" }
    });
    await expect(store.clear("missing-master-password")).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_NOT_CONFIGURED" }
    });
  });

  it("初始化后可用相同主密码读取 API Key", async () => {
    const store = new CredentialStore(await credentialPath());

    await expect(
      store.init("roundtrip-master-password", "sk-roundtrip-api-key")
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(store.status()).resolves.toEqual({
      ok: true,
      value: "configured"
    });
    await expect(store.read("roundtrip-master-password")).resolves.toEqual({
      ok: true,
      value: "sk-roundtrip-api-key"
    });
  });

  it("版本 1 文档固定使用安全基线 scrypt 参数", async () => {
    const path = await credentialPath();
    await new CredentialStore(path).init(
      "baseline-master-password",
      "sk-baseline-api-key"
    );
    const document = JSON.parse(await readFile(path, "utf8")) as {
      salt: string;
      nonce: string;
      tag: string;
      ciphertext: string;
    };

    const key = await deriveVersionOneKey(
      "baseline-master-password",
      Buffer.from(document.salt, "base64")
    );
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(document.nonce, "base64")
    );
    decipher.setAuthTag(Buffer.from(document.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(document.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
    key.fill(0);

    expect(plaintext).toBe("sk-baseline-api-key");
  });

  it("拒绝重复初始化且保留原凭据", async () => {
    const path = await credentialPath();
    const store = new CredentialStore(path);
    await store.init("original-master-password", "sk-original-api-key");
    const original = await readFile(path, "utf8");

    const result = await store.init(
      "replacement-master-password",
      "sk-replacement-api-key"
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_ALREADY_CONFIGURED" }
    });
    expect(JSON.stringify(result)).not.toContain("replacement-");
    await expect(readFile(path, "utf8")).resolves.toBe(original);
  });

  it("认证后更新 API Key", async () => {
    const store = new CredentialStore(await credentialPath());
    await store.init("update-master-password", "sk-old-api-key");

    await expect(
      store.update("update-master-password", "sk-new-api-key")
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(store.read("update-master-password")).resolves.toEqual({
      ok: true,
      value: "sk-new-api-key"
    });
  });

  it("认证后清除凭据文件", async () => {
    const store = new CredentialStore(await credentialPath());
    await store.init("clear-master-password", "sk-clear-api-key");

    await expect(store.clear("clear-master-password")).resolves.toEqual({
      ok: true,
      value: undefined
    });
    await expect(store.status()).resolves.toEqual({
      ok: true,
      value: "unconfigured"
    });
  });

  it.each(["read", "update", "clear"] as const)(
    "错误主密码执行 %s 返回认证错误且不修改文件",
    async (operation) => {
      const path = await credentialPath();
      const store = new CredentialStore(path);
      await store.init("correct-master-password", "sk-protected-api-key");
      const original = await readFile(path, "utf8");

      const result =
        operation === "read"
          ? await store.read("wrong-master-password")
          : operation === "update"
            ? await store.update("wrong-master-password", "sk-attacker-api-key")
            : await store.clear("wrong-master-password");

      expect(result).toMatchObject({
        ok: false,
        error: { code: "CREDENTIAL_AUTH_FAILED" }
      });
      expect(JSON.stringify(result)).not.toMatch(/wrong-master|protected|attacker/iu);
      await expect(readFile(path, "utf8")).resolves.toBe(original);
    }
  );

  it.each(["ciphertext", "nonce", "tag"] as const)(
    "检测被篡改的 %s 且不覆盖旧文件",
    async (field) => {
      const path = await credentialPath();
      const store = new CredentialStore(path);
      await store.init("tamper-master-password", "sk-tamper-api-key");
      const document = JSON.parse(await readFile(path, "utf8")) as Record<
        string,
        unknown
      >;
      document[field] = replaceBase64Byte(document[field] as string);
      const tampered = `${JSON.stringify(document, null, 2)}\n`;
      await writeFile(path, tampered, "utf8");

      const result = await store.read("tamper-master-password");

      expect(result).toMatchObject({
        ok: false,
        error: { code: "CREDENTIAL_AUTH_FAILED" }
      });
      expect(JSON.stringify(result)).not.toContain("tamper-");
      await expect(readFile(path, "utf8")).resolves.toBe(tampered);
    }
  );

  it("拒绝损坏结构且不静默覆盖", async () => {
    const path = await credentialPath();
    const source = JSON.stringify({
      version: 1,
      salt: "not-base64!",
      nonce: Buffer.alloc(11).toString("base64"),
      tag: Buffer.alloc(16).toString("base64"),
      ciphertext: Buffer.from("ciphertext").toString("base64")
    });
    await writeFile(path, source, "utf8");
    const store = new CredentialStore(path);

    await expect(store.status()).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_CORRUPT" }
    });
    await expect(store.read("structure-master-password")).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_CORRUPT" }
    });
    await expect(readFile(path, "utf8")).resolves.toBe(source);
  });

  it("落盘文档只含加密字段且不含任何明文", async () => {
    const path = await credentialPath();
    const store = new CredentialStore(path);
    await store.init("plaintext-master-password", "sk-plaintext-api-key");

    const source = await readFile(path, "utf8");
    const document = JSON.parse(source) as Record<string, unknown>;

    expect(Object.keys(document).sort()).toEqual([
      "ciphertext",
      "nonce",
      "salt",
      "tag",
      "version"
    ]);
    expect(document.version).toBe(1);
    expect(Buffer.from(document.salt as string, "base64")).toHaveLength(16);
    expect(Buffer.from(document.nonce as string, "base64")).toHaveLength(12);
    expect(Buffer.from(document.tag as string, "base64")).toHaveLength(16);
    expect(source).not.toMatch(/plaintext-master-password|sk-plaintext-api-key/iu);
  });

  it("并发初始化只有持锁调用成功且不会静默覆盖", async () => {
    const path = await credentialPath();
    const writeStarted = deferred();
    const releaseWrite = deferred();
    const first = new CredentialStore(path, {
      fileSystem: {
        writeFile: async (temporaryPath, value, encoding) => {
          await writeFile(temporaryPath, value, encoding);
          writeStarted.resolve();
          await releaseWrite.promise;
        }
      }
    }).init("first-master-password", "sk-first-api-key");
    const ready = await Promise.race([
      writeStarted.promise.then(() => "paused" as const),
      first.then(() => "completed" as const),
      delay(4_000).then(() => "timeout" as const)
    ]);
    if (ready !== "paused") {
      releaseWrite.resolve();
      await first;
      expect(ready).toBe("paused");
      return;
    }

    const contended = deferred();
    const second = new CredentialStore(path, {
      fileSystem: { open: contentionOpen(contended) }
    }).init("second-master-password", "sk-second-api-key");
    const contention = await Promise.race([
      contended.promise.then(() => "contended" as const),
      second.then(() => "completed" as const),
      delay(4_000).then(() => "timeout" as const)
    ]);
    releaseWrite.resolve();
    const results = await Promise.all([first, second]);

    expect(contention).toBe("contended");
    expect(results).toEqual([
      { ok: true, value: undefined },
      {
        ok: false,
        error: {
          code: "CREDENTIAL_ALREADY_CONFIGURED",
          message: "凭据已配置"
        }
      }
    ]);
    await expect(
      new CredentialStore(path).read("first-master-password")
    ).resolves.toEqual({ ok: true, value: "sk-first-api-key" });
    await expect(access(`${path}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("update 持锁完成后 clear 才重新读取最新文件", async () => {
    const path = await credentialPath();
    await new CredentialStore(path).init(
      "serialized-master-password",
      "sk-serialized-old-key"
    );
    const renameStarted = deferred();
    const releaseRename = deferred();
    const updating = new CredentialStore(path, {
      fileSystem: {
        rename: async (source, destination) => {
          if (destination === path) {
            renameStarted.resolve();
            await releaseRename.promise;
          }
          await rename(source, destination);
        }
      }
    }).update("serialized-master-password", "sk-serialized-new-key");
    const ready = await Promise.race([
      renameStarted.promise.then(() => "paused" as const),
      updating.then(() => "completed" as const),
      delay(4_000).then(() => "timeout" as const)
    ]);
    if (ready !== "paused") {
      releaseRename.resolve();
      await updating;
      expect(ready).toBe("paused");
      return;
    }

    const contended = deferred();
    const clearing = new CredentialStore(path, {
      fileSystem: { open: contentionOpen(contended) }
    }).clear("serialized-master-password");
    const contention = await Promise.race([
      contended.promise.then(() => "contended" as const),
      clearing.then(() => "completed" as const),
      delay(4_000).then(() => "timeout" as const)
    ]);
    releaseRename.resolve();
    const [updateResult, clearResult] = await Promise.all([updating, clearing]);

    expect(contention).toBe("contended");
    expect(updateResult).toEqual({ ok: true, value: undefined });
    expect(clearResult).toEqual({ ok: true, value: undefined });
    await expect(new CredentialStore(path).status()).resolves.toEqual({
      ok: true,
      value: "unconfigured"
    });
  });

  it("clear 持锁删除后 update 不会按旧认证快照重建文件", async () => {
    const path = await credentialPath();
    await new CredentialStore(path).init(
      "clear-race-master-password",
      "sk-clear-race-old-key"
    );
    const unlinkStarted = deferred();
    const releaseUnlink = deferred();
    const clearing = new CredentialStore(path, {
      fileSystem: {
        unlink: async (target) => {
          if (target === path) {
            unlinkStarted.resolve();
            await releaseUnlink.promise;
          }
          await unlink(target);
        }
      }
    }).clear("clear-race-master-password");
    const ready = await Promise.race([
      unlinkStarted.promise.then(() => "paused" as const),
      clearing.then(() => "completed" as const),
      delay(4_000).then(() => "timeout" as const)
    ]);
    if (ready !== "paused") {
      releaseUnlink.resolve();
      await clearing;
      expect(ready).toBe("paused");
      return;
    }

    const contended = deferred();
    const updating = new CredentialStore(path, {
      fileSystem: { open: contentionOpen(contended) }
    }).update("clear-race-master-password", "sk-clear-race-new-key");
    const contention = await Promise.race([
      contended.promise.then(() => "contended" as const),
      updating.then(() => "completed" as const),
      delay(4_000).then(() => "timeout" as const)
    ]);
    releaseUnlink.resolve();
    const [clearResult, updateResult] = await Promise.all([clearing, updating]);

    expect(contention).toBe("contended");
    expect(clearResult).toEqual({ ok: true, value: undefined });
    expect(updateResult).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_NOT_CONFIGURED" }
    });
    await expect(new CredentialStore(path).status()).resolves.toEqual({
      ok: true,
      value: "unconfigured"
    });
  });

  it("锁冲突超时返回 I/O 错误且不清理他人锁", async () => {
    const path = await credentialPath();
    const lockPath = `${path}.lock`;
    await writeFile(lockPath, "foreign-owner", "utf8");
    const store = new CredentialStore(path, {
      lockRetryDelayMs: 1,
      lockMaxAttempts: 2
    });

    const result = await store.init("lock-master-password", "sk-lock-api-key");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_IO_ERROR" }
    });
    expect(JSON.stringify(result)).not.toMatch(/lock-master|sk-lock|credentials/iu);
    await expect(readFile(lockPath, "utf8")).resolves.toBe("foreign-owner");
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("临时文件创建后 rename 失败只清理本次临时文件", async () => {
    const path = await credentialPath();
    const store = new CredentialStore(path);
    await store.init("io-master-password", "sk-io-original-key");
    const original = await readFile(path, "utf8");
    const foreignTemporaryPath = `${path}.foreign.tmp`;
    await writeFile(foreignTemporaryPath, "foreign", "utf8");
    let attemptedTemporaryPath: string | undefined;
    let attemptedTemporarySource: string | undefined;
    const failingStore = new CredentialStore(path, {
      fileSystem: {
        rename: async (source, destination) => {
          if (destination === path) {
            attemptedTemporaryPath = source;
            attemptedTemporarySource = await readFile(source, "utf8");
            throw Object.assign(new Error("rename failed"), { code: "EACCES" });
          }
          await rename(source, destination);
        }
      }
    });

    const result = await failingStore.update(
      "io-master-password",
      "sk-io-replacement-key"
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_IO_ERROR" }
    });
    expect(JSON.stringify(result)).not.toContain("io-");
    expect(attemptedTemporaryPath).toBeDefined();
    expect(attemptedTemporarySource).toContain('"ciphertext"');
    await expect(access(attemptedTemporaryPath as string)).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(readFile(path, "utf8")).resolves.toBe(original);
    await expect(readFile(foreignTemporaryPath, "utf8")).resolves.toBe("foreign");
    expect((await readdir(dirname(path))).sort()).toEqual([
      "credentials.json",
      "credentials.json.foreign.tmp"
    ]);
  });
});
