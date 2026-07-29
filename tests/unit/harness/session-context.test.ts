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
});
