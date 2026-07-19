import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { CredentialStore } from "../../../packages/harness/src/index.js";

async function credentialPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-credential-"));
  return join(directory, "credentials.json");
}

function replaceBase64Byte(source: string): string {
  const bytes = Buffer.from(source, "base64");
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return bytes.toString("base64");
}

describe("CredentialStore", () => {
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

  it("原子写入失败时清理单个临时文件并返回稳定错误", async () => {
    const path = await credentialPath();
    await mkdir(path);
    const store = new CredentialStore(path);

    const result = await store.init("io-master-password", "sk-io-api-key");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_IO_ERROR" }
    });
    expect(JSON.stringify(result)).not.toContain("io-");
    await expect(readdir(dirname(path))).resolves.toEqual(["credentials.json"]);
  });
});
