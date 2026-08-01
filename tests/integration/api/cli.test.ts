import { createServer, type IncomingMessage } from "node:http";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CredentialStore,
  formatApprovalRequest,
  runCli,
  type CliDependencies,
  type CredentialStoreBoundary,
  type SystemCredentialVault
} from "../../../packages/harness/src/index.js";

interface CliCapture {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly dependencies: CliDependencies;
}

function captureCli(
  cwd: string,
  secrets: readonly string[] = [],
  askApproval?: CliDependencies["askApproval"]
): CliCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let secretIndex = 0;
  return {
    stdout,
    stderr,
    dependencies: {
      cwd,
      readSecret: async () => {
        const value = secrets[secretIndex];
        secretIndex += 1;
        if (value === undefined) {
          throw new Error("测试未提供隐藏输入");
        }
        return value;
      },
      askApproval,
      writeOut: (message) => stdout.push(message),
      writeError: (message) => stderr.push(message)
    }
  };
}

async function temporaryWorkspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ai4se-cli-"));
}

function memorySystemVault(): SystemCredentialVault {
  let value: string | undefined;
  return {
    status: async () => ({ ok: true, value: value === undefined ? "unconfigured" : "configured" }),
    init: async (apiKey) => {
      value = apiKey;
      return { ok: true, value: undefined };
    },
    read: async () => value === undefined
      ? { ok: false, error: { code: "SYSTEM_CREDENTIAL_NOT_CONFIGURED", message: "missing" } }
      : { ok: true, value },
    update: async (apiKey) => {
      value = apiKey;
      return { ok: true, value: undefined };
    },
    clear: async () => {
      value = undefined;
      return { ok: true, value: undefined };
    }
  };
}

async function writeConfig(
  directory: string,
  baseUrl: string,
  relativePath = ".ai4se/config.json"
): Promise<string> {
  const path = join(directory, relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    workspace: ".",
    allowedCommands: [],
    maxSteps: 8,
    commandTimeoutMs: 5_000,
    maxOutputBytes: 4_096,
    memoryPath: ".ai4se/memory.json",
    provider: { baseUrl, model: "stub-model" }
  })}\n`, "utf8");
  return path;
}

async function startActionStub(actions: readonly Record<string, unknown>[]) {
  let requests = 0;
  const server = createServer(async (request: IncomingMessage, reply) => {
    for await (const chunk of request) {
      // 必须消费请求正文，才能准确模拟普通 HTTP 服务。
      void chunk;
    }
    const action = actions[requests];
    requests += 1;
    reply.setHeader("content-type", "application/json");
    reply.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(action) } }]
    }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("本地 HTTP stub 未取得端口");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requestCount: () => requests,
    close: async () => await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    })
  };
}

describe("runCli", () => {
  it("凭据命令通过可替换的存储边界执行", async () => {
    const cwd = await temporaryWorkspace();
    const status = vi.fn(async () => ({
      ok: true as const,
      value: "configured" as const
    }));
    const credentialStore: CredentialStoreBoundary = {
      status,
      init: vi.fn(),
      read: vi.fn(),
      update: vi.fn(),
      clear: vi.fn()
    };
    const credentialStoreFactory = vi.fn(() => credentialStore);
    const capture = captureCli(cwd);

    const exitCode = await runCli(
      ["credentials", "status"],
      { ...capture.dependencies, credentialStoreFactory }
    );

    expect(exitCode).toBe(0);
    expect(credentialStoreFactory).toHaveBeenCalledWith(
      join(cwd, ".ai4se", "credentials.json")
    );
    expect(status).toHaveBeenCalledTimes(1);
    expect(capture.stdout).toEqual(["凭据状态：configured"]);
  });

  it("显式 start 保留旧凭据兼容入口，smoke 只保留为显式命令", async () => {
    const cwd = await temporaryWorkspace();
    await writeConfig(cwd, "https://example.invalid/v1");
    await new CredentialStore(join(cwd, ".ai4se", "credentials.json")).init(
      "master-password",
      "sk-cli-provider-key"
    );
    const capture = captureCli(cwd, ["master-password"]);
    const readLine = vi.fn(async () => "/exit");

    const exitCode = await runCli(["start"], { ...capture.dependencies, readLine });

    expect(exitCode).toBe(0);
    expect(readLine).toHaveBeenCalled();
    expect(capture.stdout.join("\n")).toContain("AI4SE Coding Agent");
    expect(capture.stdout.join("\n")).not.toContain("离线 smoke");

    const smoke = captureCli(cwd);
    expect(await runCli(["smoke"], smoke.dependencies)).toBe(0);
    expect(smoke.stdout).toEqual(["AI4SE Harness 离线 smoke：completed"]);
  });

  it("普通无参数首次启动只收集三项并在第二次启动零重复输入", async () => {
    const cwd = await temporaryWorkspace();
    const vault = memorySystemVault();
    const prompts: string[] = [];
    const firstValues = ["https://provider.example/v1", "model-name", "/exit"];
    const first = captureCli(cwd, ["test-onboarding-key"]);
    const firstReadLine = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return firstValues.shift();
    });
    const factory = vi.fn(() => vault);

    expect(await runCli([], {
      ...first.dependencies,
      readLine: firstReadLine,
      systemCredentialVaultFactory: factory
    })).toBe(0);
    expect(prompts).toEqual(["服务地址：", "模型名称：", "\nai4se> "]);
    expect(first.stdout.join("\n")).toContain(`工作区：${cwd}`);
    const config = await readFile(join(cwd, ".ai4se", "config.json"), "utf8");
    expect(config).not.toContain("test-onboarding-key");
    expect(JSON.stringify([first.stdout, first.stderr])).not.toContain("test-onboarding-key");

    const second = captureCli(cwd);
    const secondReadLine = vi.fn(async () => "/exit");
    const secondReadSecret = vi.fn(async () => "must-not-read");
    expect(await runCli([], {
      ...second.dependencies,
      readLine: secondReadLine,
      readSecret: secondReadSecret,
      systemCredentialVaultFactory: factory
    })).toBe(0);
    expect(secondReadLine).toHaveBeenCalledTimes(1);
    expect(secondReadSecret).not.toHaveBeenCalled();
  });

  it("普通入口在非 Windows 系统 vault 上 fail-closed 且不询问任何输入", async () => {
    const cwd = await temporaryWorkspace();
    const readLine = vi.fn();
    const readSecret = vi.fn();
    const capture = captureCli(cwd);
    const unsupported: SystemCredentialVault = {
      status: async () => ({
        ok: false,
        error: { code: "SYSTEM_CREDENTIAL_UNSUPPORTED", message: "unsupported" }
      }),
      init: vi.fn(), read: vi.fn(), update: vi.fn(), clear: vi.fn()
    };

    expect(await runCli([], {
      ...capture.dependencies,
      readLine,
      readSecret,
      systemCredentialVaultFactory: () => unsupported
    })).toBe(1);
    expect(readLine).not.toHaveBeenCalled();
    expect(readSecret).not.toHaveBeenCalled();
    expect(capture.stderr).toEqual(["首次初始化失败：FIRST_RUN_SYSTEM_CREDENTIAL_FAILED"]);
    await expect(access(join(cwd, ".ai4se", "config.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("审批提示显示动作和目标，但不显示写入内容", () => {
    const prompt = formatApprovalRequest({
      action: { type: "write_file", path: "result.txt", content: "must-stay-hidden" }
    });

    expect(prompt).toContain("write_file");
    expect(prompt).toContain("result.txt");
    expect(prompt).not.toContain("must-stay-hidden");
  });

  it("命令审批提示显示完整的可执行文件和参数", () => {
    const prompt = formatApprovalRequest({
      action: { type: "run_command", executable: "python", args: ["add.py"] }
    });

    expect(prompt).toBe('动作 run_command，命令 "python" "add.py"');
  });

  it.each(["--api-key", "--password", "--master-password", "--secret", "--token"])(
    "立即拒绝敏感命令参数 %s 且不回显值",
    async (option) => {
      const capture = captureCli(await temporaryWorkspace());

      const exitCode = await runCli([option, "must-not-echo"], capture.dependencies);

      expect(exitCode).toBe(2);
      expect(capture.stdout).toEqual([]);
      expect(capture.stderr).toEqual(["参数包含禁止的敏感选项"]);
      expect(JSON.stringify(capture)).not.toContain("must-not-echo");
    }
  );

  it("通过隐藏输入完成 credentials init/status/update/clear，status 不读取秘密", async () => {
    const cwd = await temporaryWorkspace();
    const init = captureCli(cwd, ["master-password", "sk-initial-key"]);
    expect(await runCli(["credentials", "init"], init.dependencies)).toBe(0);
    expect(init.stdout).toEqual(["凭据初始化成功"]);

    const status = captureCli(cwd);
    expect(await runCli(["credentials", "status"], status.dependencies)).toBe(0);
    expect(status.stdout).toEqual(["凭据状态：configured"]);

    const update = captureCli(cwd, ["master-password", "sk-updated-key"]);
    expect(await runCli(["credentials", "update"], update.dependencies)).toBe(0);
    await expect(
      new CredentialStore(join(cwd, ".ai4se", "credentials.json")).read("master-password")
    ).resolves.toEqual({ ok: true, value: "sk-updated-key" });

    const clear = captureCli(cwd, ["master-password"]);
    expect(await runCli(["credentials", "clear"], clear.dependencies)).toBe(0);
    expect(clear.stdout).toEqual(["凭据清除成功"]);
    const afterClear = captureCli(cwd);
    expect(await runCli(["credentials", "status"], afterClear.dependencies)).toBe(0);
    expect(afterClear.stdout).toEqual(["凭据状态：unconfigured"]);

    const transcript = JSON.stringify([init.stdout, status.stdout, update.stdout, clear.stdout]);
    expect(transcript).not.toMatch(/master-password|sk-initial-key|sk-updated-key/iu);
  });

  it.each([
    ["空白主密码", ["   ", "sk-valid-cli-input"]],
    ["过短主密码", ["short", "sk-valid-cli-input"]],
    ["空白 API Key", ["valid-master-password", "   "]]
  ] as const)("credentials init 拒绝%s且不创建凭据文件", async (_name, secrets) => {
    const cwd = await temporaryWorkspace();
    const capture = captureCli(cwd, secrets);

    const exitCode = await runCli(["credentials", "init"], capture.dependencies);

    expect(exitCode).toBe(1);
    expect(capture.stdout).toEqual([]);
    expect(capture.stderr).toEqual([
      "凭据操作失败：CREDENTIAL_INVALID_INPUT"
    ]);
    expect(JSON.stringify([capture.stdout, capture.stderr])).not.toMatch(
      /short|sk-valid-cli-input|valid-master-password/iu
    );
    await expect(
      access(join(cwd, ".ai4se", "credentials.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    {
      name: "update 的过短主密码",
      args: ["credentials", "update"],
      secrets: ["short", "sk-replacement-cli-input"],
      error: "凭据操作失败：CREDENTIAL_INVALID_INPUT"
    },
    {
      name: "update 的空白 API Key",
      args: ["credentials", "update"],
      secrets: ["valid-master-password", "   "],
      error: "凭据操作失败：CREDENTIAL_INVALID_INPUT"
    },
    {
      name: "clear 的过短主密码",
      args: ["credentials", "clear"],
      secrets: ["short"],
      error: "凭据操作失败：CREDENTIAL_INVALID_INPUT"
    },
    {
      name: "read 的过短主密码",
      args: ["--task", "input validation"],
      secrets: ["short"],
      error: "凭据读取失败：CREDENTIAL_INVALID_INPUT"
    }
  ] as const)("拒绝$name、返回非零且保持凭据文件不变", async ({
    args,
    secrets,
    error
  }) => {
    const cwd = await temporaryWorkspace();
    await writeConfig(cwd, "http://127.0.0.1:1");
    const path = join(cwd, ".ai4se", "credentials.json");
    await new CredentialStore(path).init(
      "valid-master-password",
      "sk-original-cli-input"
    );
    const original = await readFile(path, "utf8");
    const capture = captureCli(cwd, secrets);

    const exitCode = await runCli(args, capture.dependencies);

    expect(exitCode).toBe(1);
    expect(capture.stdout).toEqual([]);
    expect(capture.stderr).toEqual([error]);
    expect(JSON.stringify([capture.stdout, capture.stderr])).not.toMatch(
      /short|replacement|original|valid-master-password/iu
    );
    await expect(readFile(path, "utf8")).resolves.toBe(original);
  });

  it.each([
    ["缺失", undefined, "配置读取失败"],
    ["无效", "{}\n", "配置无效：CONFIG_INVALID_VALUE"]
  ] as const)("配置%s时先失败且不读取凭据", async (_name, config, expectedError) => {
    const cwd = await temporaryWorkspace();
    if (config !== undefined) {
      await mkdir(join(cwd, ".ai4se"), { recursive: true });
      await writeFile(join(cwd, ".ai4se", "config.json"), config, "utf8");
    }
    const readSecret = vi.fn(async () => "must-not-read");
    const capture = captureCli(cwd);

    const exitCode = await runCli(
      ["--task", "validate configuration first"],
      { ...capture.dependencies, readSecret }
    );

    expect(exitCode).toBe(1);
    expect(readSecret).not.toHaveBeenCalled();
    expect(capture.stderr).toEqual([expectedError]);
  });

  it("未知 credentials 子命令在读取秘密前返回参数错误", async () => {
    const readSecret = vi.fn(async () => "must-not-read");
    const capture = captureCli(await temporaryWorkspace());

    const exitCode = await runCli(
      ["credentials", "unknown"],
      { ...capture.dependencies, readSecret }
    );

    expect(exitCode).toBe(2);
    expect(readSecret).not.toHaveBeenCalled();
    expect(capture.stderr).toEqual(["凭据命令无效"]);
  });

  it("审批 allow 在一次会话只询问一次并复用于后续 ask 动作", async () => {
    const cwd = await temporaryWorkspace();
    const stub = await startActionStub([
      { type: "write_file", path: "one.txt", content: "one" },
      { type: "write_file", path: "two.txt", content: "two" },
      { type: "finish", summary: "done" }
    ]);
    try {
      const configPath = await writeConfig(cwd, stub.baseUrl, "custom-config.json");
      await new CredentialStore(join(cwd, ".ai4se", "credentials.json")).init(
        "master-password",
        "sk-cli-provider-key"
      );
      const approve = vi.fn(async () => true);
      const capture = captureCli(cwd, ["master-password"], approve);

      const exitCode = await runCli(
        ["--config", configPath, "--task", "write two files"],
        capture.dependencies
      );

      expect(exitCode).toBe(0);
      expect(capture.stdout).toEqual(["任务状态：completed"]);
      expect(approve).toHaveBeenCalledTimes(1);
      await expect(readFile(join(cwd, "one.txt"), "utf8")).resolves.toBe("one");
      await expect(readFile(join(cwd, "two.txt"), "utf8")).resolves.toBe("two");
      expect(stub.requestCount()).toBe(3);
    } finally {
      await stub.close();
    }
  });

  it("审批 deny 映射为 blocked、返回非零且工具零副作用", async () => {
    const cwd = await temporaryWorkspace();
    const stub = await startActionStub([
      { type: "write_file", path: "denied.txt", content: "must-not-write" }
    ]);
    try {
      await writeConfig(cwd, stub.baseUrl);
      await new CredentialStore(join(cwd, ".ai4se", "credentials.json")).init(
        "master-password",
        "sk-cli-provider-key"
      );
      const deny = vi.fn(async () => false);
      const capture = captureCli(cwd, ["master-password"], deny);

      const exitCode = await runCli(["--task", "deny write"], capture.dependencies);

      expect(exitCode).toBe(1);
      expect(capture.stderr).toEqual(["任务执行未完成：blocked"]);
      expect(deny).toHaveBeenCalledTimes(1);
      await expect(access(join(cwd, "denied.txt"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(stub.requestCount()).toBe(1);
    } finally {
      await stub.close();
    }
  });

  it("Provider 返回包含当前凭据的 Action 时在审批和工具前阻断", async () => {
    const cwd = await temporaryWorkspace();
    const apiKey = "sk-cli-provider-key";
    const stub = await startActionStub([
      { type: "write_file", path: "leaked.txt", content: apiKey }
    ]);
    try {
      await writeConfig(cwd, stub.baseUrl);
      await new CredentialStore(join(cwd, ".ai4se", "credentials.json")).init(
        "master-password",
        apiKey
      );
      const approve = vi.fn(async () => true);
      const capture = captureCli(cwd, ["master-password"], approve);

      const exitCode = await runCli(["--task", "do not leak credentials"], capture.dependencies);

      expect(exitCode).toBe(1);
      expect(approve).not.toHaveBeenCalled();
      await expect(access(join(cwd, "leaked.txt"))).rejects.toMatchObject({ code: "ENOENT" });
      const trace = await readFile(join(cwd, ".ai4se", "trace.json"), "utf8");
      expect(trace).not.toContain(apiKey);
    } finally {
      await stub.close();
    }
  });

  it("真实 CLI 始终在启动目录执行命令，不接受旧配置切换工作区", async () => {
    const cwd = await temporaryWorkspace();
    const workspace = join(cwd, "project");
    await mkdir(workspace, { recursive: true });
    const marker = "cli-command-cwd.txt";
    const args = [
      "-e",
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, process.cwd())`
    ];
    const stub = await startActionStub([
      { type: "run_command", executable: process.execPath, args },
      { type: "finish", summary: "done" }
    ]);
    try {
      const configPath = join(cwd, ".ai4se", "config.json");
      await mkdir(join(cwd, ".ai4se"), { recursive: true });
      await writeFile(configPath, `${JSON.stringify({
        workspace: "project",
        allowedCommands: [{ executable: process.execPath, args }],
        maxSteps: 8,
        commandTimeoutMs: 5_000,
        maxOutputBytes: 4_096,
        memoryPath: ".ai4se/memory.json",
        provider: { baseUrl: stub.baseUrl, model: "stub-model" }
      })}\n`, "utf8");
      await new CredentialStore(join(cwd, ".ai4se", "credentials.json")).init(
        "master-password",
        "sk-cli-provider-key"
      );
      const capture = captureCli(cwd, ["master-password"]);

      const exitCode = await runCli(["--task", "run in workspace"], capture.dependencies);

      expect(exitCode).toBe(0);
      await expect(readFile(join(cwd, marker), "utf8")).resolves.toBe(cwd);
      await expect(access(join(workspace, marker))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await stub.close();
    }
  });

  it("拒绝空白 task 并返回参数错误退出码", async () => {
    const capture = captureCli(await temporaryWorkspace());

    const exitCode = await runCli(["--task", "   "], capture.dependencies);

    expect(exitCode).toBe(2);
    expect(capture.stderr).toEqual(["任务参数必须是非空字符串"]);
  });
});
