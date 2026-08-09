import { describe, expect, it } from "vitest";

import { Redactor } from "../../../packages/harness/src/index.js";

describe("Redactor", () => {
  it("遮蔽当前会话显式提供的敏感值", () => {
    const redactor = new Redactor(["sk-fake-session-key"]);

    expect(redactor.redactText("token=sk-fake-session-key")).toBe(
      "token=[REDACTED]"
    );
  });

  it.each([
    "Authorization: Bearer fake-bearer-token",
    "api_key=sk-fake-api-key",
    "API-KEY: fake-header-key",
    "standalone=sk-fake-standalone-key"
  ])("遮蔽常见凭据形态：%s", (source) => {
    const redacted = new Redactor().redactText(source);

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("fake-");
  });

  it("递归遮蔽对象中的字符串且保持普通内容不变", () => {
    const redactor = new Redactor(["fake-object-secret"]);
    const value = {
      action: { content: "普通内容" },
      observations: ["Bearer fake-nested-token", "fake-object-secret"]
    };

    expect(redactor.redact(value)).toEqual({
      action: { content: "普通内容" },
      observations: ["Bearer [REDACTED]", "[REDACTED]"]
    });
  });

  it("动作检测允许凭据管理源码但仍阻止真实会话 Key", () => {
    const secret = "sk-live-session-key-123456";
    const redactor = new Redactor([secret]);
    const credentialSource = [
      "interface Options { apiKey: string }",
      "const apiKey = credential.value;",
      "await readSecret(\"API Key\");"
    ].join("\n");

    expect(redactor.containsSensitive(credentialSource)).toBe(true);
    expect(redactor.containsSensitiveAction(credentialSource)).toBe(false);
    expect(redactor.containsSensitiveAction(`const leaked = "${secret}";`)).toBe(true);
  });

  it.each([
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "apiKey=\"Abcd-1234-secret-value\"",
    "sk-prod_1234567890"
  ])("动作检测阻止高置信度凭据：%s", (source) => {
    expect(new Redactor().containsSensitiveAction(source)).toBe(true);
  });

  it.each([
    "apiKey: string",
    "readSecret(\"API Key\")",
    "apiKey=\"fake-example-key-1234\"",
    "Authorization: Bearer fake-example-token"
  ])("动作检测允许源码声明和显式占位符：%s", (source) => {
    expect(new Redactor().containsSensitiveAction(source)).toBe(false);
  });

  it("测试夹具模式允许假 Key，但不允许当前会话真实 Key", () => {
    const secret = "sk-live-session-key-123456";
    const redactor = new Redactor([secret]);
    const options = { allowCredentialFixtures: true } as const;

    expect(redactor.containsSensitiveAction("sk-cli-provider-key", options)).toBe(false);
    expect(redactor.containsSensitiveAction(secret, options)).toBe(true);
  });
});
