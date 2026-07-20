import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { buildLocalWebServer } from "../../../apps/api/src/local-web-server.js";
import type { RunTaskResult } from "../../../apps/api/src/run-task.js";

async function temporaryWorkspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ai4se-local-web-"));
}

async function writeConfig(directory: string): Promise<void> {
  await mkdir(join(directory, ".ai4se"), { recursive: true });
  await writeFile(join(directory, ".ai4se", "config.json"), `${JSON.stringify({
    workspace: ".",
    allowedCommands: [],
    maxSteps: 8,
    commandTimeoutMs: 5_000,
    maxOutputBytes: 4_096,
    memoryPath: ".ai4se/memory.json",
    provider: { baseUrl: "http://127.0.0.1:1", model: "configured-model" }
  })}\n`, "utf8");
}

async function startActionStub(action: Record<string, unknown>) {
  const server = createServer(async (request: IncomingMessage, reply) => {
    for await (const chunk of request) {
      void chunk;
    }
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
    close: async () => await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    })
  };
}

function completedResult(): RunTaskResult {
  return { ok: true, value: { status: "completed", summary: "done", steps: 1, trace: [] } };
}

describe("buildLocalWebServer", () => {
  it("运行本地任务且不将 API Key 写入响应或 Trace", async () => {
    const cwd = await temporaryWorkspace();
    const stub = await startActionStub({ type: "finish", summary: "done" });
    await writeConfig(cwd);
    const app = buildLocalWebServer({ cwd });
    const validBody = {
      task: "finish safely",
      baseUrl: stub.baseUrl,
      model: "stub-model",
      apiKey: "sk-local-web-test-only"
    };

    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: {
          origin: "http://127.0.0.1:5173",
          "content-type": "application/json"
        },
        payload: validBody
      });

      expect(result).toMatchObject({ statusCode: 200 });
      expect(result.json()).toMatchObject({ status: "completed", summary: "done" });
      expect(result.body).not.toContain(validBody.apiKey);
      expect(await readFile(join(cwd, ".ai4se", "trace.json"), "utf8"))
        .not.toContain(validBody.apiKey);
    } finally {
      await app.close();
      await stub.close();
    }
  });

  it.each([
    ["未知字段", { task: "task", baseUrl: "http://127.0.0.1:1", model: "model", apiKey: "key", extra: true }],
    ["缺少字段", { task: "task", baseUrl: "http://127.0.0.1:1", model: "model" }],
    ["空白字符串", { task: " ", baseUrl: "http://127.0.0.1:1", model: "model", apiKey: "key" }],
    ["非本地 HTTP", { task: "task", baseUrl: "http://example.test", model: "model", apiKey: "key" }]
  ])("拒绝%s且不调用 runner", async (_name, payload) => {
    const runner = vi.fn(async () => completedResult());
    const app = buildLocalWebServer({ cwd: await temporaryWorkspace(), runTask: runner });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
        payload
      });

      expect(result.statusCode).toBe(400);
      expect(result.json()).toEqual({ error: { code: "RUN_REQUEST_INVALID", message: "请求参数无效" } });
      expect(runner).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    ["缺少 Origin", undefined],
    ["错误 Origin", "http://127.0.0.1:9999"]
  ])("拒绝%s且不调用 runner", async (_name, origin) => {
    const runner = vi.fn(async () => completedResult());
    const app = buildLocalWebServer({ cwd: await temporaryWorkspace(), runTask: runner });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: { "content-type": "application/json", ...(origin === undefined ? {} : { origin }) },
        payload: { task: "task", baseUrl: "http://127.0.0.1:1", model: "model", apiKey: "key" }
      });

      expect(result.statusCode).toBe(403);
      expect(result.json()).toEqual({ error: { code: "RUN_ORIGIN_FORBIDDEN", message: "请求来源不被允许" } });
      expect(runner).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("拒绝非 JSON 内容且不调用 runner", async () => {
    const runner = vi.fn(async () => completedResult());
    const app = buildLocalWebServer({ cwd: await temporaryWorkspace(), runTask: runner });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: { origin: "http://127.0.0.1:5173", "content-type": "text/plain" },
        payload: "not-json"
      });

      expect(result.statusCode).toBe(415);
      expect(result.json()).toEqual({ error: { code: "RUN_CONTENT_TYPE_INVALID", message: "请求内容类型无效" } });
      expect(runner).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("将畸形 JSON 作为请求错误且不回显请求内容", async () => {
    const apiKey = "sk-malformed-json-test-only";
    const app = buildLocalWebServer({ cwd: await temporaryWorkspace() });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
        payload: `{"apiKey":"${apiKey}"`
      });

      expect(result.statusCode).toBe(400);
      expect(result.json()).toEqual({ error: { code: "RUN_REQUEST_INVALID", message: "请求参数无效" } });
      expect(result.body).not.toContain(apiKey);
    } finally {
      await app.close();
    }
  });

  it("将超过 body 限制的请求作为稳定错误且不回显 Key", async () => {
    const apiKey = `sk-body-limit-${"x".repeat(33 * 1024)}`;
    const app = buildLocalWebServer({ cwd: await temporaryWorkspace() });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
        payload: { task: "task", baseUrl: "http://127.0.0.1:1", model: "model", apiKey }
      });

      expect(result.statusCode).toBe(413);
      expect(result.json()).toEqual({ error: { code: "RUN_REQUEST_TOO_LARGE", message: "请求内容过大" } });
      expect(result.body).not.toContain(apiKey);
    } finally {
      await app.close();
    }
  });

  it("未提供审批时阻断写入动作", async () => {
    const cwd = await temporaryWorkspace();
    const stub = await startActionStub({ type: "write_file", path: "blocked.txt", content: "must-not-write" });
    await writeConfig(cwd);
    const app = buildLocalWebServer({ cwd });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: { origin: "http://localhost:5173", "content-type": "application/json" },
        payload: { task: "write", baseUrl: stub.baseUrl, model: "stub-model", apiKey: "sk-write-test-only" }
      });

      expect(result.statusCode).toBe(200);
      expect(result.json()).toMatchObject({ status: "blocked" });
      expect(result.json()).toMatchObject({ trace: [expect.objectContaining({ stopReason: "APPROVAL_REQUIRED" })] });
      await expect(access(join(cwd, "blocked.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await app.close();
      await stub.close();
    }
  });

  it("隐藏 runner 的内部异常", async () => {
    const apiKey = "sk-internal-error-test-only";
    const runner = vi.fn(async () => {
      throw new Error(`unexpected ${apiKey}`);
    });
    const app = buildLocalWebServer({ cwd: await temporaryWorkspace(), runTask: runner });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/runs",
        headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json" },
        payload: { task: "task", baseUrl: "http://127.0.0.1:1", model: "model", apiKey }
      });

      expect(result.statusCode).toBe(500);
      expect(result.json()).toEqual({ error: { code: "RUN_INTERNAL_ERROR", message: "本地任务执行失败" } });
      expect(result.body).not.toContain(apiKey);
    } finally {
      await app.close();
    }
  });
});
