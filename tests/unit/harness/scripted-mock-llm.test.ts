import { describe, expect, it } from "vitest";

import {
  ScriptedMockExhaustedError,
  ScriptedMockLLM,
  type LLMInput,
  type LLMOutput
} from "../../../packages/harness/src/index.js";

describe("ScriptedMockLLM", () => {
  it("按顺序返回脚本结果并保存不可变的输入快照", async () => {
    const first: LLMOutput = { raw: { type: "read_file", path: "README.md" } };
    const second: LLMOutput = { raw: { type: "finish", summary: "完成" } };
    const context = ["只读项目文件"];
    const observations = ["尚未执行动作"];
    const input: LLMInput = { task: "检查项目", context, observations };
    const provider = new ScriptedMockLLM([first, second]);

    await expect(provider.complete(input)).resolves.toBe(first);
    context.push("调用后新增的上下文");
    observations[0] = "调用后篡改的观察";
    input.task = "调用后篡改的任务";
    await expect(provider.complete(input)).resolves.toBe(second);

    expect(provider.calls).toEqual([
      {
        task: "检查项目",
        context: ["只读项目文件"],
        observations: ["尚未执行动作"]
      },
      {
        task: "调用后篡改的任务",
        context: ["只读项目文件", "调用后新增的上下文"],
        observations: ["调用后篡改的观察"]
      }
    ]);
    expect(Object.isFrozen(provider.calls[0])).toBe(true);
    expect(Object.isFrozen(provider.calls[0]?.context)).toBe(true);
    expect(Object.isFrozen(provider.calls[0]?.observations)).toBe(true);
  });

  it("脚本耗尽时抛出明确错误", async () => {
    const provider = new ScriptedMockLLM([]);

    await expect(
      provider.complete({ task: "空脚本", context: [], observations: [] })
    ).rejects.toBeInstanceOf(ScriptedMockExhaustedError);
  });
});
