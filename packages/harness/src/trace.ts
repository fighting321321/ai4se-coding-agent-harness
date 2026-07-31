import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Action } from "./action.js";
import { parseAction } from "./action-parser.js";
import type { PolicyDecision } from "./policy.js";
import type { Redactor } from "./redactor.js";
import type { HookTraceEvent } from "./hooks.js";

export type TraceStatus = "running" | "completed" | "blocked" | "failed";

export interface TraceEntry {
  step: number;
  action?: Action;
  policy: PolicyDecision;
  observation?: string;
  status: TraceStatus;
  stopReason?: string;
  details?: readonly TraceDetail[];
}

export type TraceDetail =
  | { readonly type: "checkpoint_created"; readonly path: string }
  | { readonly type: "checkpoint_restored"; readonly path: string; readonly ok: boolean; readonly code?: string }
  | { readonly type: "sensor"; readonly name: string; readonly category: "pass" | "fail" | "timeout" | "environment_error"; readonly observation: string; readonly truncated: boolean }
  | { readonly type: "subagent"; readonly phase: "started" | "completed"; readonly parentSessionId: string; readonly childSessionId?: string; readonly depth: number; readonly steps?: number; readonly status?: string }
  | { readonly type: "rollback_limit"; readonly actionType: "run_command" | "call_mcp"; readonly reason: "external_side_effect_not_snapshot_capable" }
  | { readonly type: "budget"; readonly used: number; readonly remaining: number };

export type TraceErrorCode =
  | "TRACE_CORRUPT"
  | "TRACE_IO_ERROR"
  | "TRACE_INVALID_ENTRY"
  | "TRACE_STEP_DUPLICATE";

export type TraceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: TraceErrorCode; message: string } };

interface TraceDocument {
  version: 2;
  entries: TraceEntry[];
  hookEvents: HookTraceEvent[];
}

function failure<T>(code: TraceErrorCode, message: string): TraceResult<T> {
  return { ok: false, error: { code, message } };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTraceEntry(value: unknown): value is TraceEntry {
  if (!isRecord(value)) {
    return false;
  }
  const fields = Object.keys(value);
  if (
    !fields.every((field) =>
      ["step", "action", "policy", "observation", "status", "stopReason", "details"].includes(field)
    ) ||
    !fields.includes("step") ||
    !fields.includes("policy") ||
    !fields.includes("status")
  ) {
    return false;
  }
  const actionValid = value.action === undefined || parseAction(value.action).ok;
  return (
    Number.isInteger(value.step) &&
    (value.step as number) > 0 &&
    actionValid &&
    (value.policy === "allow" || value.policy === "ask" || value.policy === "deny") &&
    (value.status === "running" ||
      value.status === "completed" ||
      value.status === "blocked" ||
      value.status === "failed") &&
    (value.observation === undefined || typeof value.observation === "string") &&
    (value.stopReason === undefined || typeof value.stopReason === "string") &&
    (value.details === undefined || (Array.isArray(value.details) && value.details.every(isTraceDetail)))
  );
}

function isTraceDetail(value: unknown): value is TraceDetail {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "checkpoint_created") return typeof value.path === "string";
  if (value.type === "checkpoint_restored") return typeof value.path === "string" && typeof value.ok === "boolean" && (value.code === undefined || typeof value.code === "string");
  if (value.type === "sensor") return typeof value.name === "string" && ["pass", "fail", "timeout", "environment_error"].includes(value.category as string) && typeof value.observation === "string" && typeof value.truncated === "boolean";
  if (value.type === "subagent") return ["started", "completed"].includes(value.phase as string) && typeof value.parentSessionId === "string" && (value.childSessionId === undefined || typeof value.childSessionId === "string") && Number.isInteger(value.depth) && (value.steps === undefined || Number.isInteger(value.steps)) && (value.status === undefined || typeof value.status === "string");
  if (value.type === "rollback_limit") return ["run_command", "call_mcp"].includes(value.actionType as string) && value.reason === "external_side_effect_not_snapshot_capable";
  return value.type === "budget" && Number.isInteger(value.used) && Number.isInteger(value.remaining);
}

function copyEntry(entry: TraceEntry): TraceEntry {
  return {
    ...entry,
    ...(entry.details === undefined ? {} : { details: entry.details.map((detail) => ({ ...detail })) }),
    ...(entry.action === undefined
      ? {}
      : {
          action:
            entry.action.type === "run_command"
              ? { ...entry.action, args: [...entry.action.args] }
              : entry.action.type === "call_mcp"
                ? { ...entry.action, arguments: structuredClone(entry.action.arguments) }
                : entry.action.type === "delegate_agent"
                  ? { ...entry.action, allowedTools: [...entry.action.allowedTools] }
                : { ...entry.action }
        })
  };
}

function parseDocument(source: string): TraceDocument | undefined {
  try {
    const value: unknown = JSON.parse(source);
    if (
      !isRecord(value) ||
      ![1, 2].includes(value.version as number) ||
      (value.version === 1 && !hasExactDocumentKeys(value, ["version", "entries"])) ||
      (value.version === 2 && !hasExactDocumentKeys(value, ["version", "entries", "hookEvents"])) ||
      !Array.isArray(value.entries) ||
      !value.entries.every(isTraceEntry) ||
      new Set(value.entries.map((entry) => entry.step)).size !== value.entries.length
    ) {
      return undefined;
    }
    const hookEvents = value.version === 2 && Array.isArray(value.hookEvents) &&
      value.hookEvents.every(isHookTraceEvent)
      ? value.hookEvents.map((event) => ({ ...event }))
      : value.version === 1
        ? []
        : undefined;
    if (hookEvents === undefined) {
      return undefined;
    }
    return { version: 2, entries: value.entries.map(copyEntry), hookEvents };
  } catch {
    return undefined;
  }
}

function hasExactDocumentKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isHookTraceEvent(value: unknown): value is HookTraceEvent {
  if (!isRecord(value)) {
    return false;
  }
  const allowed = ["sessionId", "kind", "hook", "status", "actionType", "reason"];
  return Object.keys(value).every((key) => allowed.includes(key)) &&
    typeof value.sessionId === "string" && typeof value.hook === "string" &&
    ["SessionStart", "PreToolUse", "PostToolUse", "SessionEnd"].includes(value.kind as string) &&
    ["completed", "blocked", "failed"].includes(value.status as string) &&
    (value.actionType === undefined || typeof value.actionType === "string") &&
    (value.reason === undefined || typeof value.reason === "string");
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // 临时文件可能尚未创建，原始写入错误应优先返回。
    }
    throw error;
  }
}

export class JsonTrace {
  readonly #path: string;
  readonly #redactor: Redactor;

  constructor(path: string, redactor: Redactor) {
    this.#path = path;
    this.#redactor = redactor;
  }

  async read(): Promise<TraceResult<readonly TraceEntry[]>> {
    let source: string;
    try {
      source = await readFile(this.#path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return { ok: true, value: [] };
      }
      return failure("TRACE_IO_ERROR", "无法读取 Trace 文件");
    }

    const document = parseDocument(source);
    if (document === undefined) {
      return failure("TRACE_CORRUPT", "Trace JSON 已损坏或结构无效");
    }
    return {
      ok: true,
      value: this.#redactor.redact(document.entries.map(copyEntry))
    };
  }

  async append(entry: TraceEntry): Promise<TraceResult<TraceEntry>> {
    if (!isTraceEntry(entry)) {
      return failure("TRACE_INVALID_ENTRY", "Trace 条目格式无效");
    }

    const current = await this.read();
    if (!current.ok) {
      return current;
    }
    if (current.value.some((existing) => existing.step === entry.step)) {
      return failure("TRACE_STEP_DUPLICATE", "Trace step 不得重复");
    }

    const redacted = this.#redactor.redact(copyEntry(entry));
    const next = [...current.value.map(copyEntry), redacted].sort(
      (left, right) => left.step - right.step
    );
    try {
      const source = await this.#readDocument();
      if (!source.ok) {
        return source;
      }
      await atomicWrite(this.#path, { version: 2, entries: next, hookEvents: source.value.hookEvents });
      return { ok: true, value: copyEntry(redacted) };
    } catch {
      return failure("TRACE_IO_ERROR", "无法写入 Trace 文件");
    }
  }

  async readHookEvents(): Promise<TraceResult<readonly HookTraceEvent[]>> {
    const document = await this.#readDocument();
    return document.ok
      ? { ok: true, value: this.#redactor.redact(document.value.hookEvents.map((event) => ({ ...event }))) }
      : document;
  }

  async appendHookEvent(event: HookTraceEvent): Promise<TraceResult<HookTraceEvent>> {
    if (!isHookTraceEvent(event)) {
      return failure("TRACE_INVALID_ENTRY", "Hook Trace 条目格式无效");
    }
    const document = await this.#readDocument();
    if (!document.ok) {
      return document;
    }
    const redacted = this.#redactor.redact({ ...event });
    try {
      await atomicWrite(this.#path, {
        version: 2,
        entries: document.value.entries,
        hookEvents: [...document.value.hookEvents, redacted]
      });
      return { ok: true, value: redacted };
    } catch {
      return failure("TRACE_IO_ERROR", "无法写入 Trace 文件");
    }
  }

  async #readDocument(): Promise<TraceResult<TraceDocument>> {
    let source: string;
    try {
      source = await readFile(this.#path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return { ok: true, value: { version: 2, entries: [], hookEvents: [] } };
      }
      return failure("TRACE_IO_ERROR", "无法读取 Trace 文件");
    }
    const document = parseDocument(source);
    return document === undefined
      ? failure("TRACE_CORRUPT", "Trace JSON 已损坏或结构无效")
      : { ok: true, value: document };
  }
}
