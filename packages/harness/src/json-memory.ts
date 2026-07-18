import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Redactor } from "./redactor.js";

export type MemoryKind = "convention" | "recent_result";

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  tags: readonly string[];
  content: string;
  updatedAt: string;
}

export interface MemorySearchQuery {
  tags?: readonly string[];
  keywords?: readonly string[];
  limit?: number;
}

export type MemoryErrorCode =
  | "MEMORY_CORRUPT"
  | "MEMORY_IO_ERROR"
  | "MEMORY_INVALID_ITEM"
  | "MEMORY_INVALID_QUERY"
  | "MEMORY_SENSITIVE_CONTENT";

export type MemoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: MemoryErrorCode; message: string } };

interface MemoryDocument {
  version: 1;
  items: MemoryItem[];
}

function failure<T>(code: MemoryErrorCode, message: string): MemoryResult<T> {
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

function validTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isMemoryItem(value: unknown): value is MemoryItem {
  if (!isRecord(value)) {
    return false;
  }
  const fields = Object.keys(value);
  if (
    fields.length !== 5 ||
    !fields.every((field) => ["id", "kind", "tags", "content", "updatedAt"].includes(field))
  ) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    (value.kind === "convention" || value.kind === "recent_result") &&
    Array.isArray(value.tags) &&
    value.tags.length <= 20 &&
    value.tags.every(
      (tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 64
    ) &&
    typeof value.content === "string" &&
    value.content.length > 0 &&
    value.content.length <= 2_000 &&
    typeof value.updatedAt === "string" &&
    validTimestamp(value.updatedAt)
  );
}

function parseDocument(source: string): MemoryDocument | undefined {
  try {
    const value: unknown = JSON.parse(source);
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 2 ||
      value.version !== 1 ||
      !Array.isArray(value.items) ||
      !value.items.every(isMemoryItem) ||
      new Set(value.items.map((item) => item.id)).size !== value.items.length
    ) {
      return undefined;
    }
    return { version: 1, items: value.items.map(copyItem) };
  } catch {
    return undefined;
  }
}
function copyItem(item: MemoryItem): MemoryItem {
  return { ...item, tags: [...item.tags] };
}

function validTerms(terms: readonly string[] | undefined): boolean {
  return (
    terms === undefined ||
    (terms.length <= 20 && terms.every((term) => term.length > 0 && term.length <= 128))
  );
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

export class JsonMemory {
  readonly #path: string;
  readonly #redactor: Redactor;

  constructor(path: string, redactor: Redactor) {
    this.#path = path;
    this.#redactor = redactor;
  }

  async read(): Promise<MemoryResult<readonly MemoryItem[]>> {
    let source: string;
    try {
      source = await readFile(this.#path, "utf8");
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return { ok: true, value: [] };
      }
      return failure("MEMORY_IO_ERROR", "无法读取 Memory 文件");
    }

    const document = parseDocument(source);
    if (document === undefined) {
      return failure("MEMORY_CORRUPT", "Memory JSON 已损坏或结构无效");
    }
    if (this.#redactor.containsSensitive(document.items)) {
      return failure("MEMORY_SENSITIVE_CONTENT", "Memory 包含禁止持久化的敏感内容");
    }
    return { ok: true, value: document.items.map(copyItem) };
  }

  async upsert(item: MemoryItem): Promise<MemoryResult<MemoryItem>> {
    if (!isMemoryItem(item)) {
      return failure("MEMORY_INVALID_ITEM", "MemoryItem 格式无效");
    }
    if (this.#redactor.containsSensitive(item)) {
      return failure("MEMORY_SENSITIVE_CONTENT", "MemoryItem 包含敏感内容");
    }

    const current = await this.read();
    if (!current.ok) {
      return current;
    }
    const next = current.value.map(copyItem);
    const index = next.findIndex((existing) => existing.id === item.id);
    const copy = copyItem(item);
    if (index === -1) {
      next.push(copy);
    } else {
      next[index] = copy;
    }

    try {
      await atomicWrite(this.#path, { version: 1, items: next });
      return { ok: true, value: copyItem(copy) };
    } catch {
      return failure("MEMORY_IO_ERROR", "无法写入 Memory 文件");
    }
  }

  async search(query: MemorySearchQuery): Promise<MemoryResult<readonly MemoryItem[]>> {
    if (
      !validTerms(query.tags) ||
      !validTerms(query.keywords) ||
      (query.limit !== undefined &&
        (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100))
    ) {
      return failure("MEMORY_INVALID_QUERY", "Memory 检索条件无效");
    }

    const current = await this.read();
    if (!current.ok) {
      return current;
    }
    const tags = (query.tags ?? []).map((tag) => tag.toLocaleLowerCase());
    const keywords = (query.keywords ?? []).map((keyword) => keyword.toLocaleLowerCase());
    const limit = query.limit ?? 5;

    const scored = current.value
      .map((item) => {
        const itemTags = item.tags.map((tag) => tag.toLocaleLowerCase());
        const searchable = `${item.id}\n${item.content}\n${item.tags.join("\n")}`.toLocaleLowerCase();
        const score =
          tags.reduce((total, tag) => total + (itemTags.includes(tag) ? 4 : 0), 0) +
          keywords.reduce((total, keyword) => total + (searchable.includes(keyword) ? 1 : 0), 0);
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }
        const updated = right.item.updatedAt.localeCompare(left.item.updatedAt);
        return updated !== 0 ? updated : left.item.id.localeCompare(right.item.id);
      })
      .slice(0, limit)
      .map(({ item }) => copyItem(item));

    return { ok: true, value: scored };
  }

  async clear(): Promise<MemoryResult<void>> {
    const current = await this.read();
    if (!current.ok) {
      return current;
    }
    try {
      await atomicWrite(this.#path, { version: 1, items: [] });
      return { ok: true, value: undefined };
    } catch {
      return failure("MEMORY_IO_ERROR", "无法清空 Memory 文件");
    }
  }
}
