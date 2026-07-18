import { readFile, writeFile } from "node:fs/promises";

import { PathGuard, type PathGuardErrorCode } from "./path-guard.js";

export type FileToolErrorCode =
  | PathGuardErrorCode
  | "FILE_READ_FAILED"
  | "FILE_WRITE_FAILED";

export type FileToolResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: { code: FileToolErrorCode; message: string } };

export class FileTools {
  readonly #guard: PathGuard;

  constructor(workspace: string) {
    this.#guard = new PathGuard(workspace);
  }

  async readText(path: string): Promise<FileToolResult<string>> {
    const resolved = await this.#guard.resolve(path, "read");
    if (!resolved.ok) {
      return resolved;
    }

    try {
      return { ok: true, value: await readFile(resolved.value, "utf8") };
    } catch {
      return {
        ok: false,
        error: { code: "FILE_READ_FAILED", message: "读取 UTF-8 文本失败" }
      };
    }
  }

  async writeText(path: string, content: string): Promise<FileToolResult<undefined>> {
    const resolved = await this.#guard.resolve(path, "write");
    if (!resolved.ok) {
      return resolved;
    }

    try {
      await writeFile(resolved.value, content, "utf8");
      return { ok: true, value: undefined };
    } catch {
      return {
        ok: false,
        error: { code: "FILE_WRITE_FAILED", message: "写入 UTF-8 文本失败" }
      };
    }
  }
}
