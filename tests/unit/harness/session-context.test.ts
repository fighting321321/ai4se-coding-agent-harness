import { describe, expect, it } from "vitest";

import {
  Redactor,
  SessionContext
} from "../../../packages/harness/src/index.js";

describe("SessionContext", () => {
  it("按顺序保留 user、assistant、action 与 observation 的不可变快照", () => {
    const session = new SessionContext({ redactor: new Redactor(["sk-test-session-secret"]) });

    session.beginTurn("检查 README");
    session.appendAssistant("我会先读取 README");
    session.appendAction({ type: "read_file", path: "README.md" });
    session.appendObservation("pass: README 已读取");

    const snapshot = session.snapshot();
    expect(snapshot.messages).toEqual([
      { role: "user", content: "检查 README" },
      { role: "assistant", content: "我会先读取 README" },
      { role: "action", action: { type: "read_file", path: "README.md" } },
      { role: "observation", content: "pass: README 已读取" }
    ]);
    expect(snapshot.currentGoal).toBe("检查 README");
    expect(Object.isFrozen(snapshot.messages)).toBe(true);
  });

  it("对进入短期上下文的消息统一脱敏，并能只重置短期会话", () => {
    const session = new SessionContext({ redactor: new Redactor(["sk-test-session-secret"]) });
    session.beginTurn("不要显示 sk-test-session-secret");
    session.appendAssistant("已隐藏 sk-test-session-secret");
    session.appendAction({ type: "write_file", path: "note.txt", content: "sk-test-session-secret" });
    session.appendObservation("tool: sk-test-session-secret");

    expect(JSON.stringify(session.snapshot())).not.toContain("sk-test-session-secret");

    session.reset();
    expect(session.snapshot()).toEqual({ currentGoal: "", summary: "", messages: [] });
  });

  it("未达到预算时不压缩，达到预算后保留目标、规则、摘要和近期消息", () => {
    const session = new SessionContext({
      maxContextChars: 700,
      recentMessageCount: 4,
      systemConstraints: ["安全约束"],
      rules: [{ source: "AGENTS.md", scope: ".", content: "项目规则", priority: 0 }]
    });
    session.beginTurn("当前目标");
    session.appendAssistant("第一轮分析".repeat(20));
    session.appendAction({ type: "read_file", path: "one.txt" });
    session.appendObservation("pass: 第一轮输出".repeat(20));
    session.appendAssistant("第二轮分析".repeat(20));
    session.appendAction({ type: "read_file", path: "two.txt" });
    session.appendObservation("pass: 第二轮输出".repeat(20));

    const input = session.toLLMInput("当前目标", [], []);

    expect(input.currentGoal).toBe("当前目标");
    expect(input.systemConstraints).toEqual(["安全约束"]);
    expect(input.rules?.[0]?.content).toBe("项目规则");
    expect(input.summary).toContain("user: 当前目标");
    expect(input.messages).toEqual(session.snapshot().messages);
    expect(input.messages?.length).toBeLessThanOrEqual(4);
  });

  it("压缩结果重复运行稳定，摘要不含凭据、写入正文或未筛选的大段工具输出", () => {
    const secret = "sk-test-compaction-secret";
    const session = new SessionContext({
      redactor: new Redactor([secret]),
      maxContextChars: 320,
      recentMessageCount: 2,
      maxSummaryChars: 240
    });
    session.beginTurn(`处理 ${secret}`);
    session.appendAssistant(`准备写入 ${secret}`);
    session.appendAction({ type: "write_file", path: "result.txt", content: "private body ".repeat(200) });
    session.appendObservation(`tool output ${secret} ${"x".repeat(5_000)}`);
    session.appendAssistant("继续处理");

    const first = session.toLLMInput("处理", [], []);
    const second = session.toLLMInput("处理", [], []);

    expect(second).toEqual(first);
    expect(first.summary).not.toContain(secret);
    expect(first.summary).not.toContain("private body");
    expect(first.summary?.length).toBeLessThanOrEqual(240);
    expect(JSON.stringify(first)).not.toContain("x".repeat(1_000));
  });

  it("高预算下保持完整消息且摘要为空", () => {
    const session = new SessionContext({ maxContextChars: 10_000 });
    session.beginTurn("问题");
    session.appendAssistant("回答");

    const input = session.toLLMInput("问题", [], []);

    expect(input.summary).toBe("");
    expect(input.messages).toHaveLength(2);
  });
});
