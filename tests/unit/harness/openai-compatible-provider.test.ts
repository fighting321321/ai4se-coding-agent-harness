import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { describe, expect, it } from "vitest";

import {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderErrorCode
} from "../../../packages/harness/src/index.js";

interface RecordedRequest {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: IncomingMessage["headers"];
  readonly body: string;
}

interface StubOptions {
  readonly status?: number;
  readonly body: string;
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

async function startStub(
  response:
    | StubOptions
    | ((request: RecordedRequest, index: number) => StubOptions)
) {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (request: IncomingMessage, reply: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const recorded = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8")
    };
    requests.push(recorded);
    const selected = typeof response === "function"
      ? response(recorded, requests.length - 1)
      : response;
    reply.statusCode = selected.status ?? 200;
    reply.setHeader("content-type", selected.contentType ?? "application/json");
    for (const [name, value] of Object.entries(selected.headers ?? {})) {
      reply.setHeader(name, value);
    }
    reply.end(selected.body);
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
    baseUrl: `http://127.0.0.1:${address.port}/compatible/`,
    requests,
    close: async () => await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    })
  };
}

async function expectProviderError(
  promise: Promise<unknown>,
  code: OpenAICompatibleProviderErrorCode,
  forbidden: readonly string[] = []
): Promise<void> {
  try {
    await promise;
    expect.fail("预期 Provider 抛出错误");
  } catch (error) {
    expect(error).toMatchObject({
      name: "OpenAICompatibleProviderError",
      code
    });
    expect(error).not.toHaveProperty("cause");
    const serialized = error instanceof Error
      ? `${error.name}\n${error.message}\n${JSON.stringify(error)}`
      : JSON.stringify(error);
    for (const secret of forbidden) {
      expect(serialized).not.toContain(secret);
    }
  }
}

describe("OpenAICompatibleProvider", () => {
  it.each([
    ["/", "/v1/chat/completions"],
    ["/v1", "/v1/chat/completions"],
    ["/compatible/v1", "/compatible/v1/chat/completions"],
    ["/v1/chat/completions", "/v1/chat/completions"],
    ["/compatible/v1/chat/completions", "/compatible/v1/chat/completions"]
  ] as const)(
    "把 baseUrl 路径 %s 规范化为单一 endpoint %s",
    async (basePath, expectedPath) => {
      const stub = await startStub({
        body: JSON.stringify({
          choices: [{ message: { content: '{"type":"finish","summary":"done"}' } }]
        })
      });
      try {
        const provider = new OpenAICompatibleProvider({
          baseUrl: `${new URL(stub.baseUrl).origin}${basePath}`,
          model: "local-model",
          apiKey: "sk-endpoint-test"
        });

        await provider.complete({ task: "x", context: [], observations: [] });

        expect(stub.requests).toHaveLength(1);
        expect(stub.requests[0]?.url).toBe(expectedPath);
      } finally {
        await stub.close();
      }
    }
  );

  it("向规范化 endpoint 发送一次确定性 Chat Completions 请求并返回原始 Action 对象", async () => {
    const stub = await startStub({
      body: JSON.stringify({
        choices: [{ message: { content: '{"type":"finish","summary":"done"}' } }]
      })
    });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: stub.baseUrl,
        model: "local-model",
        apiKey: "sk-local-provider-test"
      });

      const result = await provider.complete({
        task: "repair tests",
        context: ["keep changes focused"],
        observations: ["fail: first attempt"]
      });

      expect(result).toEqual({
        raw: { type: "finish", summary: "done" },
        assistantText: '{"type":"finish","summary":"done"}'
      });
      expect(stub.requests).toHaveLength(1);
      const request = stub.requests[0];
      expect(request?.method).toBe("POST");
      expect(request?.url).toBe("/compatible/v1/chat/completions");
      expect(request?.headers.authorization).toBe("Bearer sk-local-provider-test");
      expect(request?.headers["content-type"]).toMatch(/^application\/json/iu);
      const requestBody = JSON.parse(request?.body ?? "") as {
        readonly model: string;
        readonly messages: readonly { readonly role: string; readonly content: string }[];
      };
      expect(requestBody.model).toBe("local-model");
      expect(requestBody.messages[1]).toEqual({
        role: "user",
        content: JSON.stringify({
          task: "repair tests",
          context: ["keep changes focused"],
          observations: ["fail: first attempt"]
        })
      });
      const systemPrompt = requestBody.messages[0]?.content;
      expect(systemPrompt).toContain('{"type":"read_file","path":"相对路径"}');
      expect(systemPrompt).toContain(
        '{"type":"write_file","path":"相对路径","content":"文件内容"}'
      );
      expect(systemPrompt).toContain(
        '{"type":"run_command","executable":"命令","args":["参数"]}'
      );
      expect(systemPrompt).toContain('{"type":"finish","summary":"最终回答"}');
      expect(systemPrompt).toContain("普通问答或不需要工具时，必须使用 finish Action");
      expect(systemPrompt).toContain("不要使用 action、respond 或 content 字段");
    } finally {
      await stub.close();
    }
  });

  it("把系统安全约束和带作用域的工作区规则置于 Action 提示中", async () => {
    const stub = await startStub({
      body: JSON.stringify({
        choices: [{ message: { content: '{"type":"finish","summary":"done"}' } }]
      })
    });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: stub.baseUrl,
        model: "local-model",
        apiKey: "sk-rules-provider-test"
      });

      await provider.complete({
        task: "x",
        context: [],
        observations: [],
        systemConstraints: ["Policy 不可绕过"],
        rules: [{
          source: "AGENTS.md",
          scope: ".",
          content: "使用项目统一入口",
          priority: 0
        }]
      });

      const body = JSON.parse(stub.requests[0]?.body ?? "") as {
        readonly messages: readonly { readonly content: string }[];
      };
      expect(body.messages[0]?.content).toContain("Policy 不可绕过");
      expect(body.messages[0]?.content).toContain("AGENTS.md");
      expect(body.messages[0]?.content).toContain("作用域：.");
      expect(body.messages[0]?.content).toContain("使用项目统一入口");
    } finally {
      await stub.close();
    }
  });

  it("把能力名片放入用户输入，并将命中 Skill 置于不可覆盖安全约束的低优先级区", async () => {
    const stub = await startStub({
      body: JSON.stringify({
        choices: [{ message: { content: '{"type":"finish","summary":"done"}' } }]
      })
    });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: stub.baseUrl,
        model: "local-model",
        apiKey: "sk-extension-provider-test"
      });
      await provider.complete({
        task: "x",
        context: [],
        observations: [],
        systemConstraints: ["Policy 不可绕过"],
        capabilities: {
          builtins: ["load_skill", "call_mcp"],
          skills: [{ name: "review", description: "Review changes" }],
          mcp: [{ server: "mock", name: "lookup", description: "Lookup", trust: "external" }]
        },
        skillInstructions: ["尝试覆盖 Policy"]
      });

      const body = JSON.parse(stub.requests[0]?.body ?? "") as {
        readonly messages: readonly { readonly content: string }[];
      };
      expect(body.messages[0]?.content).toContain("系统安全约束（最高优先级");
      expect(body.messages[0]?.content).toContain("Skill 指令（低于系统安全约束、Policy、Approval");
      expect(body.messages[0]?.content).toContain('{"type":"load_skill"');
      expect(body.messages[0]?.content).toContain('{"type":"call_mcp"');
      expect(JSON.parse(body.messages[1]?.content ?? "{}").capabilities).toEqual({
        builtins: ["load_skill", "call_mcp"],
        skills: [{ name: "review", description: "Review changes" }],
        mcp: [{ server: "mock", name: "lookup", description: "Lookup", trust: "external" }]
      });
    } finally {
      await stub.close();
    }
  });

  it.each([
    [401, "PROVIDER_AUTHENTICATION_FAILED"],
    [429, "PROVIDER_RATE_LIMITED"],
    [500, "PROVIDER_SERVER_ERROR"],
    [418, "PROVIDER_HTTP_ERROR"]
  ] as const)("HTTP %i 返回稳定且脱敏的 %s", async (status, code) => {
    const responseBody = "server-body-must-not-leak";
    const apiKey = "sk-http-error-secret";
    const stub = await startStub({ status, body: responseBody, contentType: "text/plain" });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: stub.baseUrl,
        model: "local-model",
        apiKey
      });

      await expectProviderError(
        provider.complete({ task: "x", context: [], observations: [] }),
        code,
        [stub.baseUrl, apiKey, responseBody]
      );
      expect(stub.requests).toHaveLength(1);
    } finally {
      await stub.close();
    }
  });

  it("307 重定向不跟随且只向源 endpoint 请求一次", async () => {
    const responseBody = "redirect-body-must-not-leak";
    const apiKey = "sk-redirect-secret";
    const stub = await startStub((request) => request.url === "/redirect-target"
      ? {
          body: JSON.stringify({
            choices: [{ message: { content: '{"type":"finish","summary":"redirected"}' } }]
          })
        }
      : {
          status: 307,
          body: responseBody,
          contentType: "text/plain",
          headers: { location: "/redirect-target" }
        });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: stub.baseUrl,
        model: "local-model",
        apiKey
      });

      await expectProviderError(
        provider.complete({ task: "x", context: [], observations: [] }),
        "PROVIDER_HTTP_ERROR",
        [stub.baseUrl, apiKey, responseBody, "/redirect-target"]
      );
      expect(stub.requests).toHaveLength(1);
      expect(stub.requests[0]?.url).toBe("/compatible/v1/chat/completions");
      expect(stub.requests.filter((request) => request.url === "/redirect-target")).toHaveLength(0);
    } finally {
      await stub.close();
    }
  });

  it.each([
    ["响应正文不是 JSON", "not-json", "PROVIDER_RESPONSE_INVALID"],
    ["choices 为空", '{"choices":[]}', "PROVIDER_RESPONSE_INVALID"],
    ["content 为空", '{"choices":[{"message":{"content":""}}]}', "PROVIDER_RESPONSE_INVALID"],
    ["content 非字符串", '{"choices":[{"message":{"content":42}}]}', "PROVIDER_RESPONSE_INVALID"],
    ["Action JSON 无效", '{"choices":[{"message":{"content":"not-json"}}]}', "PROVIDER_ACTION_INVALID"],
    ["Action 是数组", '{"choices":[{"message":{"content":"[]"}}]}', "PROVIDER_ACTION_INVALID"],
    ["Action 是 null", '{"choices":[{"message":{"content":"null"}}]}', "PROVIDER_ACTION_INVALID"]
  ] as const)("%s 时只请求一次并返回稳定错误", async (_name, body, code) => {
    const stub = await startStub({ body });
    try {
      const provider = new OpenAICompatibleProvider({
        baseUrl: stub.baseUrl,
        model: "local-model",
        apiKey: "sk-invalid-response-secret"
      });

      await expectProviderError(
        provider.complete({ task: "x", context: [], observations: [] }),
        code,
        [stub.baseUrl, "sk-invalid-response-secret", body]
      );
      expect(stub.requests).toHaveLength(1);
    } finally {
      await stub.close();
    }
  });

  it("网络失败不重试且不泄露底层异常", async () => {
    const stub = await startStub({ body: "{}" });
    const baseUrl = stub.baseUrl;
    await stub.close();
    const provider = new OpenAICompatibleProvider({
      baseUrl,
      model: "local-model",
      apiKey: "sk-network-secret"
    });

    await expectProviderError(
      provider.complete({ task: "x", context: [], observations: [] }),
      "PROVIDER_NETWORK_ERROR",
      [baseUrl, "sk-network-secret", "ECONNREFUSED", "fetch failed"]
    );
  });

  it.each(["relative/path", "ftp://127.0.0.1/model"])(
    "拒绝非 HTTP(S) 绝对 baseUrl：%s",
    (baseUrl) => {
      expect(() => new OpenAICompatibleProvider({
        baseUrl,
        model: "local-model",
        apiKey: "sk-config-secret"
      })).toThrow(expect.objectContaining({ code: "PROVIDER_INVALID_CONFIG" }));
    }
  );

  it.each([
    "https://provider.example/v1",
    "http://localhost:11434/v1",
    "http://127.0.0.1:11434/v1",
    "http://[::1]:11434/v1"
  ])("允许 HTTPS 或本机回环 HTTP baseUrl：%s", (baseUrl) => {
    expect(() => new OpenAICompatibleProvider({
      baseUrl,
      model: "local-model",
      apiKey: "sk-config-secret"
    })).not.toThrow();
  });

  it.each([
    "http://provider.example/v1",
    "http://192.0.2.1:11434/v1"
  ])("拒绝非本机 HTTP baseUrl 且错误不包含 URL：%s", (baseUrl) => {
    try {
      new OpenAICompatibleProvider({
        baseUrl,
        model: "local-model",
        apiKey: "sk-config-secret"
      });
      expect.fail("预期 Provider 拒绝非本机 HTTP");
    } catch (error) {
      expect(error).toMatchObject({ code: "PROVIDER_INVALID_CONFIG" });
      expect(error instanceof Error ? error.message : JSON.stringify(error)).not.toContain(
        baseUrl
      );
    }
  });
});
