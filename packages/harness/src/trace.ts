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
  sessionId?: string;
  userInputSummary?: string;
  assistantOutputSummary?: string;
  action?: Action;
  policy: PolicyDecision;
  approval?: "not_required" | "required" | "approved" | "denied" | "failed";
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
  | { readonly type: "memory"; readonly phase: "retrieved" | "candidate_collected"; readonly count: number }
  | { readonly type: "budget"; readonly used: number; readonly remaining: number };

export interface TraceReplay {
  readonly version: 3;
  readonly entries: readonly TraceEntry[];
  readonly hookEvents: readonly HookTraceEvent[];
}

export type TraceErrorCode =
  | "TRACE_CORRUPT"
  | "TRACE_IO_ERROR"
  | "TRACE_INVALID_ENTRY"
  | "TRACE_STEP_DUPLICATE"
  | "TRACE_SIZE_LIMIT";

export type TraceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: TraceErrorCode; message: string } };

interface TraceDocument {
  version: 3;
  entries: TraceEntry[];
  hookEvents: HookTraceEvent[];
}

const MAX_TRACE_BYTES = 1024 * 1024;
const MAX_TRACE_SUMMARY_CHARS = 512;
const MAX_TRACE_ENTRIES = 2_048;
const MAX_HOOK_EVENTS = 4_096;

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
      ["step", "sessionId", "userInputSummary", "assistantOutputSummary", "action", "policy", "approval", "observation", "status", "stopReason", "details"].includes(field)
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
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    (value.userInputSummary === undefined || typeof value.userInputSummary === "string") &&
    (value.assistantOutputSummary === undefined || typeof value.assistantOutputSummary === "string") &&
    actionValid &&
    (value.policy === "allow" || value.policy === "ask" || value.policy === "deny") &&
    (value.approval === undefined || ["not_required", "required", "approved", "denied", "failed"].includes(value.approval as string)) &&
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
  if (value.type === "memory") return ["retrieved", "candidate_collected"].includes(value.phase as string) && Number.isInteger(value.count) && (value.count as number) >= 0;
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
  if (Buffer.byteLength(source, "utf8") > MAX_TRACE_BYTES) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(source);
    if (
      !isRecord(value) ||
      ![1, 2, 3].includes(value.version as number) ||
      (value.version === 1 && !hasExactDocumentKeys(value, ["version", "entries"])) ||
      (value.version === 2 && !hasExactDocumentKeys(value, ["version", "entries", "hookEvents"])) ||
      (value.version === 3 && !hasExactDocumentKeys(value, ["version", "entries", "hookEvents"])) ||
      !Array.isArray(value.entries) ||
      value.entries.length > MAX_TRACE_ENTRIES ||
      !value.entries.every(isTraceEntry) ||
      new Set(value.entries.map((entry) => entry.step)).size !== value.entries.length
    ) {
      return undefined;
    }
    const hookEvents = (value.version === 2 || value.version === 3) && Array.isArray(value.hookEvents) &&
      value.hookEvents.length <= MAX_HOOK_EVENTS &&
      value.hookEvents.every(isHookTraceEvent)
      ? value.hookEvents.map((event) => ({ ...event }))
      : value.version === 1
        ? []
        : undefined;
    if (hookEvents === undefined) {
      return undefined;
    }
    return { version: 3, entries: value.entries.map(copyEntry), hookEvents };
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

  async replay(): Promise<TraceResult<TraceReplay>> {
    const document = await this.#readDocument();
    return document.ok
      ? {
          ok: true,
          value: {
            version: 3,
            entries: document.value.entries.map(copyEntry),
            hookEvents: document.value.hookEvents.map((event) => ({ ...event }))
          }
        }
      : document;
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

    const redacted = this.#redactor.redact(boundEntry(copyEntry(entry)));
    const next = [...current.value.map(copyEntry), redacted].sort(
      (left, right) => left.step - right.step
    );
    try {
      const source = await this.#readDocument();
      if (!source.ok) {
        return source;
      }
      const document = { version: 3, entries: next, hookEvents: source.value.hookEvents } as const;
      if (Buffer.byteLength(JSON.stringify(document), "utf8") > MAX_TRACE_BYTES) {
        return failure("TRACE_SIZE_LIMIT", "Trace 已达到大小上限");
      }
      await atomicWrite(this.#path, document);
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
    if (document.value.hookEvents.length >= MAX_HOOK_EVENTS) {
      return failure("TRACE_SIZE_LIMIT", "Hook Trace 已达到事件上限");
    }
    try {
      const next = {
        version: 3,
        entries: document.value.entries,
        hookEvents: [...document.value.hookEvents, redacted]
      } as const;
      if (Buffer.byteLength(JSON.stringify(next), "utf8") > MAX_TRACE_BYTES) {
        return failure("TRACE_SIZE_LIMIT", "Trace 已达到大小上限");
      }
      await atomicWrite(this.#path, next);
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
        return { ok: true, value: { version: 3, entries: [], hookEvents: [] } };
      }
      return failure("TRACE_IO_ERROR", "无法读取 Trace 文件");
    }
    const document = parseDocument(source);
    return document === undefined
      ? failure("TRACE_CORRUPT", "Trace JSON 已损坏或结构无效")
      : { ok: true, value: document };
  }
}

function boundedSummary(value: string | undefined): string | undefined {
  if (value === undefined || value.length <= MAX_TRACE_SUMMARY_CHARS) return value;
  return `${value.slice(0, MAX_TRACE_SUMMARY_CHARS - 12)}[TRUNCATED]`;
}

function boundEntry(entry: TraceEntry): TraceEntry {
  return {
    ...entry,
    userInputSummary: boundedSummary(entry.userInputSummary),
    assistantOutputSummary: boundedSummary(entry.assistantOutputSummary),
    observation: boundedSummary(entry.observation),
    stopReason: boundedSummary(entry.stopReason)
  };
}
