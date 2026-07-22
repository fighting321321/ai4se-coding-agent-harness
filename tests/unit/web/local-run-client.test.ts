import { describe, expect, it, vi } from "vitest";

import {
  runLocalAgent,
  submitLocalRun,
  type LocalRunRequest
} from "../../../apps/web/src/local-run-client.js";
import { LocalRunResultView } from "../../../apps/web/src/LocalApp.js";
import { createRequire } from "node:module";

import type * as React from "../../../apps/web/node_modules/@types/react/index.d.ts";
import type * as ReactDomServer from "../../../apps/web/node_modules/@types/react-dom/server.d.ts";

const require = createRequire(import.meta.url);
const { createElement } = require("../../../apps/web/node_modules/react") as typeof React;
const { renderToStaticMarkup } = require("../../../apps/web/node_modules/react-dom/server") as typeof ReactDomServer;

const request: LocalRunRequest = {
  task: "finish safely",
  baseUrl: "https://provider.example/v1",
  model: "course-model",
  apiKey: "sk-client-test-only"
};

describe("本地运行客户端", () => {
  it("成功后清空 Key 并返回本地结果", async () => {
    const send = vi.fn(async () => ({
      status: "completed" as const,
      summary: "done",
      steps: 1,
      trace: []
    }));

    await expect(submitLocalRun(request, send)).resolves.toMatchObject({
      apiKey: "",
      result: { status: "completed" }
    });
    expect(send).toHaveBeenCalledWith(request);
  });

  it("失败后清空 Key，返回固定错误且不回显秘密", async () => {
    const result = await submitLocalRun(request, async () => {
      throw new Error(request.apiKey);
    });

    expect(result).toEqual({ apiKey: "", error: "本地运行请求失败" });
    expect(JSON.stringify(result)).not.toContain(request.apiKey);
  });

  it("成功响应回显当前 Key 时丢弃结果", async () => {
    const result = await submitLocalRun(request, async () => ({
      status: "completed",
      summary: `done ${request.apiKey}`,
      steps: 1,
      trace: [{
        step: 1,
        policy: "allow",
        status: "completed",
        observation: request.apiKey,
        action: { type: "finish", summary: request.apiKey }
      }]
    }));

    expect(result).toEqual({ apiKey: "", error: "本地运行请求失败" });
    expect(JSON.stringify(result)).not.toContain(request.apiKey);
  });

  it.each([
    ["null 条目", null],
    ["非正整数 step", { step: 0, policy: "allow", status: "completed" }],
    ["非法 policy", { step: 1, policy: "invalid", status: "completed" }],
    ["非法 status", { step: 1, policy: "allow", status: "invalid" }],
    ["非字符串 observation", { step: 1, policy: "allow", status: "completed", observation: 1 }],
    ["非字符串 stopReason", { step: 1, policy: "allow", status: "completed", stopReason: 1 }],
    ["缺少 action 字段", { step: 1, policy: "allow", status: "completed", action: { type: "finish" } }],
    ["未知 action 字段", { step: 1, policy: "allow", status: "completed", action: { type: "finish", summary: "done", extra: true } }],
    ["错误 action 字段类型", { step: 1, policy: "allow", status: "completed", action: { type: "run_command", executable: "pnpm", args: [1] } }]
  ])("拒绝含%s的响应 Trace", async (_name, entry) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      summary: "done",
      steps: 1,
      trace: [entry]
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(runLocalAgent(request, fetchImpl as typeof fetch)).rejects.toThrow(
      "本地运行响应格式无效"
    );
  });

  it.each([
    ["顶层 status", { status: { toString: null }, summary: "done", steps: 1, trace: [] }],
    ["Trace policy", { status: "completed", summary: "done", steps: 1, trace: [{ step: 1, policy: { toString: null }, status: "completed" }] }],
    ["Trace status", { status: "completed", summary: "done", steps: 1, trace: [{ step: 1, policy: "allow", status: { toString: null } }] }]
  ])("对象化%s仍返回固定响应格式错误", async (_name, body) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

    await expect(runLocalAgent(request, fetchImpl as typeof fetch)).rejects.toThrow(
      "本地运行响应格式无效"
    );
  });

  it("只发送一次 JSON POST 请求", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      summary: "done",
      steps: 1,
      trace: []
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(runLocalAgent(request, fetchImpl as typeof fetch)).resolves.toMatchObject({
      status: "completed"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  });

  it("非成功响应始终使用固定错误且不重试", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: request.apiKey }
    }), { status: 422, headers: { "content-type": "application/json" } }));

    await expect(runLocalAgent(request, fetchImpl as typeof fetch)).rejects.toThrow(
      "本地运行请求失败"
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("网络连接失败映射为本地服务未启动", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`connect failed ${request.apiKey}`);
    });

    await expect(runLocalAgent(request, fetchImpl as typeof fetch)).rejects.toThrow(
      "本地服务未启动"
    );
    await expect(submitLocalRun(request, (nextRequest) => runLocalAgent(nextRequest, fetchImpl as typeof fetch)))
      .resolves.toEqual({ apiKey: "", error: "本地服务未启动" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("结果视图展示安全摘要和各 Provider 停止原因", () => {
    const html = renderToStaticMarkup(createElement(LocalRunResultView, {
      result: {
        status: "failed",
        summary: "Provider 调用失败",
        steps: 3,
        trace: [
          { step: 1, policy: "allow", status: "failed", stopReason: "provider_authentication_failed" },
          { step: 2, policy: "allow", status: "failed", stopReason: "provider_rate_limited" },
          { step: 3, policy: "allow", status: "failed", stopReason: "provider_server_error" }
        ]
      }
    }));

    expect(html).toContain("Provider 调用失败");
    expect(html).toContain("provider_authentication_failed");
    expect(html).toContain("provider_rate_limited");
    expect(html).toContain("provider_server_error");
    expect(html).not.toContain(request.apiKey);
    expect(html).not.toContain("远端响应正文");
  });
});
