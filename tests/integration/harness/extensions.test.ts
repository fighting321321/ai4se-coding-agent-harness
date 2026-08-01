import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  AgentLoop,
  ApprovalGate,
  Dispatcher,
  HookManager,
  JsonMemory,
  JsonTrace,
  McpRegistry,
  MockMcpConnection,
  PolicyEngine,
  Redactor,
  ScriptedMockLLM,
  SkillRegistry
} from "../../../packages/harness/src/index.js";

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ai4se-extensions-"));
  const skill = join(root, ".ai4se", "skills", "review");
  await mkdir(skill, { recursive: true });
  await writeFile(
    join(skill, "SKILL.md"),
    "---\nname: review\ndescription: Review repository changes\n---\nREVIEW FULL INSTRUCTIONS",
    "utf8"
  );
  return root;
}

describe("T15 extension lifecycle", () => {
  it("用 ScriptedMockLLM 渐进加载 Skill，并治理调用 mock MCP 后回灌结果", async () => {
    const root = await createWorkspace();
    const redactor = new Redactor(["sk-mcp-secret"]);
    const trace = new JsonTrace(join(root, ".ai4se", "trace.json"), redactor);
    const hooks = new HookManager({
      hooks: [{
        name: "audit",
        sessionStart: () => undefined,
        preToolUse: () => undefined,
        postToolUse: () => undefined,
        sessionEnd: () => undefined
      }],
      sessionId: "session-t15",
      redactor,
      record: async (event) => { await trace.appendHookEvent(event); }
    });
    const skills = new SkillRegistry(root);
    const connection = new MockMcpConnection({
      server: "mock",
      tools: [{ name: "lookup", description: "Look up mock data", inputSchema: {} }],
      responses: [{ ok: true, value: { content: "answer sk-mcp-secret" } }]
    });
    const mcp = new McpRegistry([connection], { redactor });
    const dispatcher = new Dispatcher();
    dispatcher.register("load_skill", (action) => skills.load(action.name));
    dispatcher.register("call_mcp", (action) => mcp.call({
      server: action.server,
      tool: action.tool,
      arguments: action.arguments
    }));
    dispatcher.register("finish", (action) => action.summary);
    const provider = new ScriptedMockLLM([
      { raw: { type: "load_skill", name: "review" } },
      { raw: { type: "call_mcp", server: "mock", tool: "lookup", arguments: { q: "status" } } },
      { raw: { type: "finish", summary: "done" } }
    ]);
    const loop = new AgentLoop({
      provider,
      memory: new JsonMemory(join(root, ".ai4se", "memory.json"), redactor),
      dispatcher,
      trace,
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(async () => true),
      hooks,
      skills,
      mcp,
      redactor
    });

    const result = await loop.run("review then lookup");
    await hooks.end("exit");

    expect(result).toMatchObject({ status: "completed", steps: 3 });
    expect(provider.calls[0]?.capabilities?.skills).toEqual([
      { name: "review", description: "Review repository changes" }
    ]);
    expect(provider.calls[0]?.capabilities?.mcp).toEqual([
      { server: "mock", name: "lookup", description: "Look up mock data", trust: "external" }
    ]);
    expect(JSON.stringify(provider.calls[0])).not.toContain("REVIEW FULL INSTRUCTIONS");
    expect(provider.calls[1]?.skillInstructions).toEqual([
      expect.stringContaining("REVIEW FULL INSTRUCTIONS")
    ]);
    expect(provider.calls[2]?.observations).toEqual(["pass: tool completed"]);
    expect(connection.calls).toHaveLength(1);
    const events = await trace.readHookEvents();
    expect(events.ok && events.value.map((event) => `${event.kind}:${event.status}`)).toEqual([
      "SessionStart:completed",
      "PreToolUse:completed",
      "PostToolUse:completed",
      "PreToolUse:completed",
      "PostToolUse:completed",
      "SessionEnd:completed"
    ]);
    expect(JSON.stringify([result, events])).not.toContain("sk-mcp-secret");
  });

  it("PreToolUse 在 MCP 外部调用前阻断，Policy/Approval 已通过也保持零调用", async () => {
    const root = await createWorkspace();
    const connection = new MockMcpConnection({
      server: "mock",
      tools: [{ name: "mutate", description: "external mutation", inputSchema: {} }],
      responses: [{ ok: true, value: { content: "changed" } }]
    });
    const mcp = new McpRegistry([connection]);
    const dispatcher = new Dispatcher();
    dispatcher.register("call_mcp", (action) => mcp.call({
      server: action.server,
      tool: action.tool,
      arguments: action.arguments
    }));
    const approval = vi.fn(async () => true);
    const loop = new AgentLoop({
      provider: new ScriptedMockLLM([{ raw: {
        type: "call_mcp", server: "mock", tool: "mutate", arguments: {}
      } }]),
      memory: new JsonMemory(join(root, ".ai4se", "memory.json"), new Redactor()),
      dispatcher,
      trace: new JsonTrace(join(root, ".ai4se", "trace.json"), new Redactor()),
      policy: new PolicyEngine({ allowedCommands: [] }),
      approval: new ApprovalGate(approval),
      hooks: new HookManager({
        hooks: [{ name: "freeze", preToolUse: () => ({ block: true }) }]
      }),
      mcp
    });

    const result = await loop.run("mutate external system");

    expect(result).toMatchObject({ status: "blocked", summary: "生命周期 Hook 阻断该动作" });
    expect(approval).toHaveBeenCalledTimes(1);
    expect(connection.calls).toHaveLength(0);
    expect(result.trace[0]).toMatchObject({ stopReason: "hook_blocked" });
  });
});
