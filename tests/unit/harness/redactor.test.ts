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
});
