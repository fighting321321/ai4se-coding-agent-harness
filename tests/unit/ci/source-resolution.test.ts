import { describe, expect, it } from "vitest";

import { Redactor } from "@ai4se/harness";

describe("source workspace resolution", () => {
  it("测试环境直接解析 harness 源码而不依赖预先生成的 dist", () => {
    expect(typeof new Redactor().containsSensitiveAction).toBe("function");
  });
});
