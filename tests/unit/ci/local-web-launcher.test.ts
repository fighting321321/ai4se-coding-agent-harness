import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

type LauncherModule = {
  startLocalWeb(options: {
    readonly runtime: FakeRuntime;
    readonly spawnProcess: ReturnType<typeof vi.fn>;
    readonly log: ReturnType<typeof vi.fn>;
  }): void;
};

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  readonly signals: string[] = [];

  kill(signal?: string): boolean {
    this.signals.push(signal ?? "SIGTERM");
    this.killed = true;
    return true;
  }
}

class FakeRuntime extends EventEmitter {
  readonly env: Record<string, string | undefined>;
  readonly execPath = "node";
  exitCode: number | undefined;

  constructor(env: Record<string, string | undefined> = { npm_execpath: "pnpm-cli.cjs" }) {
    super();
    this.env = env;
  }
}

async function startLauncher(environment?: Record<string, string | undefined>) {
  const launcher = (await import("../../../scripts/local-web-runner.mjs")) as LauncherModule;
  const api = new FakeChildProcess();
  const web = new FakeChildProcess();
  const runtime = new FakeRuntime(environment);
  const spawnProcess = vi.fn((
    command: string,
    arguments_: readonly string[],
    options: { readonly env: Record<string, string | undefined> }
  ) => {
    void command;
    void arguments_;
    void options;
    return spawnProcess.mock.calls.length === 1 ? api : web;
  });
  const log = vi.fn();

  launcher.startLocalWeb({ runtime, spawnProcess, log });

  return { api, log, runtime, spawnProcess, web };
}

describe("local Web launcher", () => {
  it("收到 SIGINT 时以 130 退出并清理两个子进程", async () => {
    const { api, runtime, web } = await startLauncher();

    runtime.emit("SIGINT");
    api.emit("exit", 1, null);
    web.emit("error", new Error("stopped"));

    expect(runtime.exitCode).toBe(130);
    expect(api.signals).toEqual(["SIGINT"]);
    expect(web.signals).toEqual(["SIGINT"]);
  });

  it("收到 SIGTERM 时以 143 退出并不让子进程事件覆盖状态", async () => {
    const { api, runtime, web } = await startLauncher();

    runtime.emit("SIGTERM");
    api.emit("error", new Error("stopped"));
    web.emit("exit", 1, null);

    expect(runtime.exitCode).toBe(143);
    expect(api.signals).toEqual(["SIGTERM"]);
    expect(web.signals).toEqual(["SIGTERM"]);
  });

  it("把严格校验后的非默认端口传给两个子进程并输出准确启动文案", async () => {
    const { log, spawnProcess } = await startLauncher({
      npm_execpath: "pnpm-cli.cjs",
      AI4SE_LOCAL_API_PORT: "4312",
      PRIVATE_VALUE: "不得打印"
    });

    expect(spawnProcess).toHaveBeenCalledTimes(2);
    for (const call of spawnProcess.mock.calls) {
      expect(call[2].env.AI4SE_LOCAL_API_PORT).toBe("4312");
    }
    expect(log).toHaveBeenCalledWith("正在启动本地 API：http://127.0.0.1:4312");
    expect(JSON.stringify(log.mock.calls)).not.toContain("不得打印");
  });

  it.each(["", " 4174", "4174 ", "4174abc", "41.74", "0", "65536", "-1"])(
    "端口 %j 无效时不会启动子进程",
    async (value) => {
      const launcher = (await import("../../../scripts/local-web-runner.mjs")) as LauncherModule;
      const spawnProcess = vi.fn();

      expect(() => launcher.startLocalWeb({
        runtime: new FakeRuntime({ npm_execpath: "pnpm-cli.cjs", AI4SE_LOCAL_API_PORT: value }),
        spawnProcess,
        log: vi.fn()
      })).toThrow("AI4SE_LOCAL_API_PORT 必须是有效端口");
      expect(spawnProcess).not.toHaveBeenCalled();
    }
  );

  it("child error 将父进程置为失败并只终止仍运行的同伴", async () => {
    const { api, runtime, web } = await startLauncher();

    api.emit("error", new Error("spawn failed"));
    web.emit("exit", 9, null);

    expect(runtime.exitCode).toBe(1);
    expect(api.signals).toEqual([]);
    expect(web.signals).toEqual(["SIGTERM"]);
  });

  it("child 正常零退出仍视为失败且重复事件不重复清理", async () => {
    const { api, runtime, web } = await startLauncher();

    api.exitCode = 0;
    api.emit("exit", 0, null);
    web.emit("error", new Error("stopped"));

    expect(runtime.exitCode).toBe(1);
    expect(api.signals).toEqual([]);
    expect(web.signals).toEqual(["SIGTERM"]);
  });

  it("child 非零退出保留失败码且只清理一次", async () => {
    const { api, runtime, web } = await startLauncher();

    web.exitCode = 7;
    web.emit("exit", 7, null);
    api.emit("exit", 0, null);

    expect(runtime.exitCode).toBe(7);
    expect(api.signals).toEqual(["SIGTERM"]);
    expect(web.signals).toEqual([]);
  });
});
