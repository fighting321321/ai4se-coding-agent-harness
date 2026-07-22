import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Action } from "./action.js";
import { parseAction } from "./action-parser.js";
import type { PolicyDecision } from "./policy.js";
import type { Redactor } from "./redactor.js";

export type TraceStatus = "running" | "completed" | "blocked" | "failed";

export interface TraceEntry {
  step: number;
  action?: Action;
  policy: PolicyDecision;
  observation?: string;
  status: TraceStatus;
  stopReason?: string;
}

export type TraceErrorCode =
  | "TRACE_CORRUPT"
  | "TRACE_IO_ERROR"
  | "TRACE_INVALID_ENTRY"
  | "TRACE_STEP_DUPLICATE";

export type TraceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: TraceErrorCode; message: string } };

interface TraceDocument {
  version: 1;
  entries: TraceEntry[];
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
      ["step", "action", "policy", "observation", "status", "stopReason"].includes(field)
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
    (value.stopReason === undefined || typeof value.stopReason === "string")
  );
}

function copyEntry(entry: TraceEntry): TraceEntry {
  return {
    ...entry,
    ...(entry.action === undefined
      ? {}
      : {
          action:
            entry.action.type === "run_command"
              ? { ...entry.action, args: [...entry.action.args] }
              : { ...entry.action }
        })
  };
}

function parseDocument(source: string): TraceDocument | undefined {
  try {
    const value: unknown = JSON.parse(source);
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 2 ||
      value.version !== 1 ||
      !Array.isArray(value.entries) ||
      !value.entries.every(isTraceEntry) ||
      new Set(value.entries.map((entry) => entry.step)).size !== value.entries.length
    ) {
      return undefined;
    }
    return { version: 1, entries: value.entries.map(copyEntry) };
  } catch {
    return undefined;
  }
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
      await atomicWrite(this.#path, { version: 1, entries: next });
      return { ok: true, value: copyEntry(redacted) };
    } catch {
      return failure("TRACE_IO_ERROR", "无法写入 Trace 文件");
    }
  }
}
