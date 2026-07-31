import { randomUUID } from "node:crypto";
import { lstat, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PathGuard, type PathGuardErrorCode } from "./path-guard.js";
import { Redactor } from "./redactor.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export type CheckpointErrorCode =
  | PathGuardErrorCode
  | "CHECKPOINT_NOT_FILE"
  | "CHECKPOINT_SYMLINK"
  | "CHECKPOINT_TOO_LARGE"
  | "CHECKPOINT_SENSITIVE"
  | "CHECKPOINT_IO_ERROR"
  | "CHECKPOINT_INVALID"
  | "CHECKPOINT_RESTORE_UNSAFE";

export interface CheckpointSnapshot {
  readonly id: string;
  readonly path: string;
  readonly existed: boolean;
  readonly byteLength: number;
}

export interface CheckpointRestore {
  readonly path: string;
  readonly restored: true;
  readonly mode: "replaced" | "removed_created_file" | "already_absent";
}

export type CheckpointResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: { readonly code: CheckpointErrorCode; readonly message: string } };

export interface WorkspaceCheckpointOptions {
  readonly workspace: string;
  readonly maxFileBytes?: number;
  readonly redactor?: Redactor;
}

interface StoredSnapshot extends CheckpointSnapshot {
  readonly content?: string;
}

function failure<Value>(code: CheckpointErrorCode, message: string): CheckpointResult<Value> {
  return { ok: false, error: { code, message } };
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export class WorkspaceCheckpoint {
  readonly #workspace: string;
  readonly #guard: PathGuard;
  readonly #maxFileBytes: number;
  readonly #redactor: Redactor;
  readonly #snapshots = new Map<string, StoredSnapshot>();

  constructor(options: WorkspaceCheckpointOptions) {
    this.#workspace = resolve(options.workspace);
    this.#guard = new PathGuard(this.#workspace);
    this.#maxFileBytes = options.maxFileBytes ?? 64 * 1024;
    this.#redactor = options.redactor ?? new Redactor();
    if (!Number.isInteger(this.#maxFileBytes) || this.#maxFileBytes < 1) {
      throw new Error("maxFileBytes 必须是正整数");
    }
  }

  async capture(path: string): Promise<CheckpointResult<CheckpointSnapshot>> {
    const checked = await this.#guard.resolve(path, "write");
    if (!checked.ok) return checked;

    let info;
    try {
      info = await lstat(resolve(this.#workspace, path));
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        const snapshot: StoredSnapshot = Object.freeze({
          id: randomUUID(), path, existed: false, byteLength: 0
        });
        this.#snapshots.set(snapshot.id, snapshot);
        return { ok: true, value: snapshot };
      }
      return failure("CHECKPOINT_IO_ERROR", "无法读取快照目标元数据");
    }

    if (info.isSymbolicLink()) return failure("CHECKPOINT_SYMLINK", "Checkpoint 拒绝符号链接");
    if (!info.isFile()) return failure("CHECKPOINT_NOT_FILE", "Checkpoint 只支持单个普通文件");
    if (info.size > this.#maxFileBytes) return failure("CHECKPOINT_TOO_LARGE", "Checkpoint 文件超过大小限制");

    try {
      const bytes = await readFile(checked.value);
      if (bytes.byteLength > this.#maxFileBytes) {
        return failure("CHECKPOINT_TOO_LARGE", "Checkpoint 文件超过大小限制");
      }
      let content: string;
      try {
        content = UTF8_DECODER.decode(bytes);
      } catch {
        return failure("CHECKPOINT_NOT_FILE", "Checkpoint 只支持 UTF-8 文本文件");
      }
      if (this.#redactor.containsSensitive(content)) {
        return failure("CHECKPOINT_SENSITIVE", "Checkpoint 不保存敏感内容");
      }
      const snapshot: StoredSnapshot = Object.freeze({
        id: randomUUID(), path, existed: true, byteLength: bytes.byteLength, content
      });
      this.#snapshots.set(snapshot.id, snapshot);
      return { ok: true, value: snapshot };
    } catch {
      return failure("CHECKPOINT_IO_ERROR", "无法读取快照文件");
    }
  }

  async restore(snapshot: CheckpointSnapshot): Promise<CheckpointResult<CheckpointRestore>> {
    const stored = this.#snapshots.get(snapshot.id);
    if (stored === undefined || stored.path !== snapshot.path || stored.existed !== snapshot.existed) {
      return failure("CHECKPOINT_INVALID", "Checkpoint 快照无效或不属于当前存储");
    }
    const checked = await this.#guard.resolve(stored.path, "write");
    if (!checked.ok) return failure("CHECKPOINT_RESTORE_UNSAFE", "Checkpoint 恢复目标无法安全解析");

    try {
      let current;
      try {
        current = await lstat(resolve(this.#workspace, stored.path));
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      if (current !== undefined && (current.isSymbolicLink() || !current.isFile())) {
        return failure("CHECKPOINT_RESTORE_UNSAFE", "Checkpoint 恢复目标不再是普通文件");
      }

      if (stored.existed) {
        if (stored.content === undefined) return failure("CHECKPOINT_INVALID", "Checkpoint 缺少受控正文");
        await writeFile(checked.value, stored.content, "utf8");
        this.#snapshots.delete(stored.id);
        return { ok: true, value: { path: stored.path, restored: true, mode: "replaced" } };
      }

      if (current === undefined) {
        this.#snapshots.delete(stored.id);
        return { ok: true, value: { path: stored.path, restored: true, mode: "already_absent" } };
      }
      await unlink(checked.value);
      this.#snapshots.delete(stored.id);
      return { ok: true, value: { path: stored.path, restored: true, mode: "removed_created_file" } };
    } catch {
      return failure("CHECKPOINT_IO_ERROR", "Checkpoint 单文件恢复失败");
    }
  }

  discard(snapshot: CheckpointSnapshot): CheckpointResult<void> {
    const stored = this.#snapshots.get(snapshot.id);
    if (stored === undefined || stored.path !== snapshot.path || stored.existed !== snapshot.existed) {
      return failure("CHECKPOINT_INVALID", "Checkpoint 快照无效或不属于当前存储");
    }
    this.#snapshots.delete(stored.id);
    return { ok: true, value: undefined };
  }
}
