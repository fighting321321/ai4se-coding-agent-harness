import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AgentLoop,
  Dispatcher,
  HookManager,
  initializeFirstRun,
  JsonMemory,
  JsonTrace,
  MemoryLifecycle,
  PolicyEngine,
  Redactor,
  ScriptedMockLLM,
  SessionContext,
  type SystemCredentialVault
} from "../../../packages/harness/src/index.js";

function memoryVault(): SystemCredentialVault {
  let secret: string | undefined;
  return {
    status: async () => ({ ok: true, value: secret === undefined ? "unconfigured" : "configured" }),
    init: async (value) => { secret = value; return { ok: true, value: undefined }; },
    read: async () => secret === undefined
      ? { ok: false, error: { code: "SYSTEM_CREDENTIAL_NOT_CONFIGURED", message: "missing" } }
      : { ok: true, value: secret },
    update: async (value) => { secret = value; return { ok: true, value: undefined }; },
    clear: async () => { secret = undefined; return { ok: true, value: undefined }; }
  };
}

describe("最终 Harness 离线验收", () => {
  it("从全新工作区三项初始化，经连续会话固化 Memory，并在重启后脱敏回放", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-final-acceptance-"));
    const vault = memoryVault();
    const answers = ["https://provider.invalid/v1", "mock-model"];
    const initialized = await initializeFirstRun({ cwd: workspace }, {
      readLine: async () => answers.shift(),
      readSecret: async () => "test-only-secret",
      systemCredentialVaultFactory: () => vault
    });
    expect(initialized).toEqual({ ok: true, value: { initialized: true } });

    const redactor = new Redactor(["test-only-secret"]);
    const memory = new JsonMemory(join(workspace, ".ai4se", "memory.json"), redactor);
    const lifecycle = new MemoryLifecycle({ memory, redactor, now: () => new Date("2026-07-31T00:00:00Z") });
    const trace = new JsonTrace(join(workspace, ".ai4se", "trace.json"), redactor);
    const hooks = new HookManager({ sessionId: "offline-session", redactor });
    const session = new SessionContext({ redactor });
    const loop = new AgentLoop({
      provider: new ScriptedMockLLM([
        { raw: { type: "finish", summary: "已记住 Vitest 约定" }, assistantText: "第一轮完成" },
        { raw: { type: "finish", summary: "继续使用 Vitest" }, assistantText: "引用上一轮" }
      ]),
      memory,
      memoryLifecycle: lifecycle,
      dispatcher: new Dispatcher(),
      trace,
      policy: new PolicyEngine({ allowedCommands: [] }),
      redactor,
      session,
      hooks
    });

    await loop.run("记住约定：测试使用 Vitest");
    const second = await loop.run("下一题继续采用什么测试框架？");
    expect(second).toMatchObject({ status: "completed", summary: "继续使用 Vitest" });
    expect(await lifecycle.consolidate()).toMatchObject({ ok: true, value: { written: 3 } });

    const restarted = new MemoryLifecycle({
      memory: new JsonMemory(join(workspace, ".ai4se", "memory.json"), redactor),
      redactor
    });
    const recovered = await restarted.retrieve("Vitest 测试框架");
    expect(recovered).toMatchObject({ ok: true });
    expect(recovered.ok && recovered.value.some((item) => item.content.includes("Vitest"))).toBe(true);

    const replay = await trace.replay();
    expect(replay).toMatchObject({ ok: true, value: { version: 3 } });
    expect(JSON.stringify(replay)).not.toContain("test-only-secret");
    expect(replay.ok && replay.value.entries.map((entry) => entry.sessionId)).toEqual([
      "offline-session",
      "offline-session"
    ]);
  });
});
