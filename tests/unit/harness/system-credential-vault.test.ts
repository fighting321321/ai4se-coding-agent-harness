import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  WindowsUserCredentialVault,
  type CredentialProtectionProcess,
  type CredentialProtectionProcessRequest
} from "../../../packages/harness/src/index.js";

async function vaultPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ai4se-system-vault-"));
  return join(directory, "missing", "credentials.system.json");
}

function reversibleProtectionProcess(): CredentialProtectionProcess {
  return async (request) => {
    const input = Buffer.from(request.input, "base64");
    const output = request.operation === "protect"
      ? Buffer.concat([Buffer.from("sealed:"), input])
      : input.subarray(Buffer.from("sealed:").length);
    return { exitCode: 0, stdout: output.toString("base64") };
  };
}

describe("WindowsUserCredentialVault", () => {
  it.runIf(process.platform === "win32")(
    "使用 Windows DPAPI 当前用户范围完成真实往返",
    async () => {
      const vault = new WindowsUserCredentialVault(await vaultPath());

      await expect(vault.init("dpapi-roundtrip-test-value")).resolves.toEqual({
        ok: true,
        value: undefined
      });
      await expect(vault.read()).resolves.toEqual({
        ok: true,
        value: "dpapi-roundtrip-test-value"
      });
      await expect(vault.clear()).resolves.toEqual({
        ok: true,
        value: undefined
      });
    }
  );

  it("在 Windows 当前用户保护边界中完成初始化、读取、更新和清除", async () => {
    const path = await vaultPath();
    const vault = new WindowsUserCredentialVault(path, {
      platform: "win32",
      runProtectionProcess: reversibleProtectionProcess()
    });

    await expect(vault.status()).resolves.toEqual({
      ok: true,
      value: "unconfigured"
    });
    await expect(vault.init("test-api-key-one")).resolves.toEqual({
      ok: true,
      value: undefined
    });
    await expect(vault.read()).resolves.toEqual({
      ok: true,
      value: "test-api-key-one"
    });
    await expect(vault.update("test-api-key-two")).resolves.toEqual({
      ok: true,
      value: undefined
    });
    await expect(vault.read()).resolves.toEqual({
      ok: true,
      value: "test-api-key-two"
    });
    await expect(vault.clear()).resolves.toEqual({ ok: true, value: undefined });
    await expect(vault.status()).resolves.toEqual({
      ok: true,
      value: "unconfigured"
    });
  });

  it("只经 stdin 向固定 PowerShell 脚本传递秘密且落盘不含明文", async () => {
    const path = await vaultPath();
    const requests: CredentialProtectionProcessRequest[] = [];
    const runProtectionProcess: CredentialProtectionProcess = async (request) => {
      requests.push(request);
      return request.operation === "protect"
        ? { exitCode: 0, stdout: Buffer.from("opaque-protected-value").toString("base64") }
        : { exitCode: 0, stdout: Buffer.from("test-secret-value").toString("base64") };
    };
    const vault = new WindowsUserCredentialVault(path, {
      platform: "win32",
      runProtectionProcess
    });

    await vault.init("test-secret-value");
    await vault.read();

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ operation: "protect" });
    expect(requests[0]?.input).toBe(
      Buffer.from("test-secret-value").toString("base64")
    );
    expect(requests[1]).toMatchObject({ operation: "unprotect" });
    expect(requests[0]?.command).toBe("powershell.exe");
    expect(requests[0]?.args).toEqual(requests[1]?.args);
    expect(JSON.stringify(requests.map(({ command, args }) => ({ command, args })))).not
      .toContain("test-secret-value");
    expect(await readFile(path, "utf8")).not.toContain("test-secret-value");
  });

  it("非 Windows 平台稳定 fail-closed 且不创建目录或调用进程", async () => {
    const path = await vaultPath();
    const runProtectionProcess = vi.fn<CredentialProtectionProcess>();
    const vault = new WindowsUserCredentialVault(path, {
      platform: "linux",
      runProtectionProcess
    });

    for (const result of [
      await vault.status(),
      await vault.init("test-api-key"),
      await vault.read(),
      await vault.update("replacement-api-key"),
      await vault.clear()
    ]) {
      expect(result).toEqual({
        ok: false,
        error: {
          code: "SYSTEM_CREDENTIAL_UNSUPPORTED",
          message: "当前平台不支持系统凭据保护"
        }
      });
    }
    expect(runProtectionProcess).not.toHaveBeenCalled();
    await expect(access(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("拒绝空白凭据且不调用保护进程或创建目录", async () => {
    const path = await vaultPath();
    const runProtectionProcess = vi.fn<CredentialProtectionProcess>();
    const vault = new WindowsUserCredentialVault(path, {
      platform: "win32",
      runProtectionProcess
    });

    await expect(vault.init(" \t ")).resolves.toMatchObject({
      ok: false,
      error: { code: "SYSTEM_CREDENTIAL_INVALID_INPUT" }
    });
    await expect(vault.update("")).resolves.toMatchObject({
      ok: false,
      error: { code: "SYSTEM_CREDENTIAL_INVALID_INPUT" }
    });
    expect(runProtectionProcess).not.toHaveBeenCalled();
    await expect(access(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("拒绝重复初始化并保持原凭据", async () => {
    const path = await vaultPath();
    const vault = new WindowsUserCredentialVault(path, {
      platform: "win32",
      runProtectionProcess: reversibleProtectionProcess()
    });
    await vault.init("original-api-key");
    const original = await readFile(path, "utf8");

    const result = await vault.init("replacement-api-key");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SYSTEM_CREDENTIAL_ALREADY_CONFIGURED" }
    });
    expect(JSON.stringify(result)).not.toContain("replacement-api-key");
    await expect(readFile(path, "utf8")).resolves.toBe(original);
  });

  it("保护进程失败时返回脱敏错误且不落盘", async () => {
    const path = await vaultPath();
    const vault = new WindowsUserCredentialVault(path, {
      platform: "win32",
      runProtectionProcess: async () => ({
        exitCode: 1,
        stdout: "test-secret-value"
      })
    });

    const result = await vault.init("test-secret-value");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SYSTEM_CREDENTIAL_PROTECTION_FAILED",
        message: "系统凭据保护操作失败"
      }
    });
    expect(JSON.stringify(result)).not.toContain("test-secret-value");
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("拒绝损坏或非当前用户保护格式的文档且不调用解密", async () => {
    const path = await vaultPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({
      version: 1,
      protection: "plaintext",
      protectedValue: Buffer.from("test-api-key").toString("base64")
    }), "utf8");
    const runProtectionProcess = vi.fn<CredentialProtectionProcess>();
    const vault = new WindowsUserCredentialVault(path, {
      platform: "win32",
      runProtectionProcess
    });

    await expect(vault.status()).resolves.toMatchObject({
      ok: false,
      error: { code: "SYSTEM_CREDENTIAL_CORRUPT" }
    });
    await expect(vault.read()).resolves.toMatchObject({
      ok: false,
      error: { code: "SYSTEM_CREDENTIAL_CORRUPT" }
    });
    expect(runProtectionProcess).not.toHaveBeenCalled();
  });

  it("未配置时 read、update 和 clear 均显式失败", async () => {
    const vault = new WindowsUserCredentialVault(await vaultPath(), {
      platform: "win32",
      runProtectionProcess: reversibleProtectionProcess()
    });

    for (const result of [
      await vault.read(),
      await vault.update("test-api-key"),
      await vault.clear()
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "SYSTEM_CREDENTIAL_NOT_CONFIGURED" }
      });
    }
  });
});
