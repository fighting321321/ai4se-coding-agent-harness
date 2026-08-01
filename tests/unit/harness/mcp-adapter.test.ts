import { describe, expect, it } from "vitest";

import {
  McpRegistry,
  MockMcpConnection
} from "../../../packages/harness/src/index.js";

describe("McpRegistry", () => {
  it("稳定发现限长名片并通过自研边界调用 mock 工具", async () => {
    const connection = new MockMcpConnection({
      server: "demo",
      tools: [{ name: "echo", description: "Echo deterministic input", inputSchema: {} }],
      responses: [{ ok: true, value: { content: "hello" } }]
    });
    const registry = new McpRegistry([connection]);

    await expect(registry.discover()).resolves.toEqual({ ok: true, value: [{
      server: "demo",
      name: "echo",
      description: "Echo deterministic input",
      trust: "external"
    }] });
    await expect(registry.call({ server: "demo", tool: "echo", arguments: { text: "hi" } }))
      .resolves.toEqual({ ok: true, value: { content: "hello" } });
    expect(connection.calls).toEqual([{ tool: "echo", arguments: { text: "hi" } }]);
  });

  it.each([
    ["failure", { ok: false, error: { code: "MCP_REMOTE_FAILED", message: "raw secret" } }],
    ["timeout", { ok: false, error: { code: "MCP_TIMEOUT", message: "late" } }],
    ["invalid", { invalid: true }]
  ] as const)("把 mock MCP %s 映射为固定且脱敏的错误", async (_name, response) => {
    const registry = new McpRegistry([new MockMcpConnection({
      server: "demo",
      tools: [{ name: "tool", description: "tool", inputSchema: {} }],
      responses: [response]
    })], { redactorValues: ["raw secret"] });
    await registry.discover();

    const result = await registry.call({ server: "demo", tool: "tool", arguments: {} });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("raw secret");
    if (!result.ok) {
      expect(["MCP_CALL_FAILED", "MCP_TIMEOUT", "MCP_RESULT_INVALID"]).toContain(result.error.code);
    }
  });
});
