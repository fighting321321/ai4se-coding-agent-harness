import type { Action } from "./action.js";

export type ActionParseResult =
  | { ok: true; value: Action }
  | {
      ok: false;
      error: { code: "ACTION_PARSE_FAILED"; message: string };
    };

type UnknownRecord = Record<string, unknown>;

function failure(message: string): ActionParseResult {
  return { ok: false, error: { code: "ACTION_PARSE_FAILED", message } };
}

function isRecord(raw: unknown): raw is UnknownRecord {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

function hasExactKeys(record: UnknownRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(record, key));
}

function copyJsonRecord(value: UnknownRecord): UnknownRecord | undefined {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 16_384) {
      return undefined;
    }
    const copy: unknown = JSON.parse(serialized);
    return isRecord(copy) ? copy : undefined;
  } catch {
    return undefined;
  }
}

export function parseAction(raw: unknown): ActionParseResult {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return failure("动作必须是包含字符串 type 字段的对象");
  }

  switch (raw.type) {
    case "read_file":
      if (!hasExactKeys(raw, ["type", "path"]) || typeof raw.path !== "string") {
        return failure("read_file 动作必须且只能包含字符串 path 字段");
      }
      return { ok: true, value: { type: "read_file", path: raw.path } };

    case "write_file":
      if (
        !hasExactKeys(raw, ["type", "path", "content"]) ||
        typeof raw.path !== "string" ||
        typeof raw.content !== "string"
      ) {
        return failure("write_file 动作必须且只能包含字符串 path 和 content 字段");
      }
      return {
        ok: true,
        value: { type: "write_file", path: raw.path, content: raw.content }
      };

    case "run_command":
      if (
        !hasExactKeys(raw, ["type", "executable", "args"]) ||
        typeof raw.executable !== "string" ||
        !Array.isArray(raw.args) ||
        !raw.args.every((argument) => typeof argument === "string")
      ) {
        return failure("run_command 动作必须且只能包含字符串 executable 和字符串数组 args 字段");
      }
      return {
        ok: true,
        value: { type: "run_command", executable: raw.executable, args: [...raw.args] }
      };

    case "load_skill":
      if (!hasExactKeys(raw, ["type", "name"]) || typeof raw.name !== "string") {
        return failure("load_skill 动作必须且只能包含字符串 name 字段");
      }
      return { ok: true, value: { type: "load_skill", name: raw.name } };

    case "call_mcp": {
      const copiedArguments = isRecord(raw.arguments) ? copyJsonRecord(raw.arguments) : undefined;
      if (
        !hasExactKeys(raw, ["type", "server", "tool", "arguments"]) ||
        typeof raw.server !== "string" ||
        typeof raw.tool !== "string" ||
        copiedArguments === undefined
      ) {
        return failure("call_mcp 动作必须且只能包含 server、tool 和对象 arguments 字段");
      }
      return {
        ok: true,
        value: {
          type: "call_mcp",
          server: raw.server,
          tool: raw.tool,
          arguments: copiedArguments
        }
      };
    }

    case "delegate_agent": {
      const allowed = new Set(["read_file", "write_file", "run_command", "load_skill", "call_mcp"]);
      if (
        !hasExactKeys(raw, ["type", "task", "allowedTools"]) ||
        typeof raw.task !== "string" || raw.task.trim().length === 0 || raw.task.length > 4_096 ||
        !Array.isArray(raw.allowedTools) ||
        raw.allowedTools.length > 5 ||
        !raw.allowedTools.every((tool) => typeof tool === "string" && allowed.has(tool)) ||
        new Set(raw.allowedTools).size !== raw.allowedTools.length
      ) {
        return failure("delegate_agent 动作必须且只能包含非空 task 和不重复的受限 allowedTools");
      }
      return {
        ok: true,
        value: {
          type: "delegate_agent",
          task: raw.task,
          allowedTools: [...raw.allowedTools] as Extract<Action, { type: "delegate_agent" }>["allowedTools"]
        }
      };
    }

    case "finish":
      if (!hasExactKeys(raw, ["type", "summary"]) || typeof raw.summary !== "string") {
        return failure("finish 动作必须且只能包含字符串 summary 字段");
      }
      return { ok: true, value: { type: "finish", summary: raw.summary } };

    default:
      return failure(`未知动作类型：${raw.type}`);
  }
}
