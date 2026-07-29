import { createHash } from "node:crypto";

import {
  type JsonMemory,
  type MemoryItem,
  type MemoryResult
} from "./json-memory.js";
import { Redactor } from "./redactor.js";

const MAX_CONTENT_CHARS = 320;
const MAX_TAGS = 12;
const EXPLICIT_CONVENTION = /^(?:记住约定|项目约定|convention|remember this convention)\s*[:：]\s*(.+)$/iu;

export interface MemoryLifecycleOptions {
  readonly memory: JsonMemory;
  readonly redactor?: Redactor;
  readonly now?: () => Date;
}

export interface MemoryConsolidateSummary {
  readonly written: number;
  readonly total: number;
}

function copyItem(item: MemoryItem): MemoryItem {
  return { ...item, tags: [...item.tags] };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function bounded(value: string): string {
  if (value.length <= MAX_CONTENT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_CONTENT_CHARS - 12)}[TRUNCATED]`;
}

function terms(value: string): readonly string[] {
  const matches = value.match(/[a-z0-9_-]{2,}|[\p{Script=Han}]{2,8}/giu) ?? [];
  return [...new Set(matches.map((term) => term.toLocaleLowerCase()))]
    .sort()
    .slice(0, MAX_TAGS);
}

function candidateId(kind: MemoryItem["kind"], content: string): string {
  return `${kind}-${createHash("sha256").update(`${kind}\0${content}`).digest("hex").slice(0, 24)}`;
}

export class MemoryLifecycle {
  readonly #memory: JsonMemory;
  readonly #redactor: Redactor;
  readonly #now: () => Date;
  readonly #pending = new Map<string, MemoryItem>();

  constructor(options: MemoryLifecycleOptions) {
    this.#memory = options.memory;
    this.#redactor = options.redactor ?? new Redactor();
    this.#now = options.now ?? (() => new Date());
  }

  collectExplicitConvention(input: string): boolean {
    const matched = normalizeText(input).match(EXPLICIT_CONVENTION);
    if (matched?.[1] === undefined) {
      return false;
    }
    return this.#collect("convention", matched[1], matched[1]);
  }

  collectCompletedTask(task: string, summary: string): boolean {
    return this.#collect("recent_result", summary, task);
  }

  pending(): readonly MemoryItem[] {
    return [...this.#pending.values()]
      .sort((left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.content.localeCompare(right.content) ||
        left.id.localeCompare(right.id)
      )
      .map(copyItem);
  }

  async retrieve(task: string): Promise<MemoryResult<readonly MemoryItem[]>> {
    const keywords = terms(this.#redactor.redactText(normalizeText(task)));
    if (keywords.length === 0) {
      return { ok: true, value: [] };
    }
    return await this.#memory.search({ tags: keywords, keywords, limit: 5 });
  }

  async list(): Promise<MemoryResult<readonly MemoryItem[]>> {
    return await this.#memory.read();
  }

  async clear(): Promise<MemoryResult<void>> {
    const cleared = await this.#memory.clear();
    if (cleared.ok) {
      this.#pending.clear();
    }
    return cleared;
  }

  async consolidate(): Promise<MemoryResult<MemoryConsolidateSummary>> {
    const candidates = this.pending();
    if (candidates.length === 0) {
      const current = await this.#memory.read();
      return current.ok
        ? { ok: true, value: { written: 0, total: current.value.length } }
        : current;
    }

    const result = await this.#memory.consolidate(candidates);
    if (!result.ok) {
      return result;
    }
    this.#pending.clear();
    return {
      ok: true,
      value: { written: candidates.length, total: result.value.length }
    };
  }

  #collect(kind: MemoryItem["kind"], rawContent: string, tagSource: string): boolean {
    if (this.#redactor.containsSensitive(rawContent)) {
      return false;
    }
    const content = bounded(this.#redactor.redactText(normalizeText(rawContent)));
    if (content.length === 0 || content.includes("[REDACTED]")) {
      return false;
    }
    const tags = terms(this.#redactor.redactText(normalizeText(tagSource)));
    if (tags.length === 0) {
      return false;
    }
    const id = candidateId(kind, content);
    this.#pending.set(id, {
      id,
      kind,
      tags,
      content,
      updatedAt: this.#now().toISOString()
    });
    return true;
  }
}
