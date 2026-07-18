import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type PathAccess = "read" | "write";

export type PathGuardErrorCode =
  | "PATH_INVALID"
  | "PATH_OUTSIDE_WORKSPACE"
  | "PATH_SENSITIVE"
  | "PATH_NOT_FOUND"
  | "PATH_RESOLUTION_FAILED";

export type PathGuardResult =
  | { ok: true; value: string }
  | { ok: false; error: { code: PathGuardErrorCode; message: string } };

const SENSITIVE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "service-account.json"
]);

function failure(code: PathGuardErrorCode, message: string): PathGuardResult {
  return { ok: false, error: { code, message } };
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/u).filter((segment) => segment.length > 0);
}

function isSensitive(path: string): boolean {
  return pathSegments(path).some((segment) => {
    const normalized = segment.toLowerCase();
    return SENSITIVE_NAMES.has(normalized) || normalized.startsWith(".env.");
  });
}

function isInside(workspace: string, target: string): boolean {
  const relation = relative(workspace, target);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export class PathGuard {
  readonly #workspace: string;

  constructor(workspace: string) {
    this.#workspace = resolve(workspace);
  }

  async resolve(path: string, access: PathAccess): Promise<PathGuardResult> {
    if (path.length === 0 || path.includes("\0") || isAbsolute(path)) {
      return failure("PATH_INVALID", "文件路径必须是非空的 workspace 相对路径");
    }

    if (pathSegments(path).includes("..")) {
      return failure("PATH_OUTSIDE_WORKSPACE", "文件路径不得包含上级目录逃逸");
    }

    if (isSensitive(path)) {
      return failure("PATH_SENSITIVE", "拒绝访问敏感文件");
    }

    try {
      const workspaceRealPath = await realpath(this.#workspace);
      const candidate = resolve(workspaceRealPath, path);
      let targetRealPath: string;

      if (access === "read") {
        targetRealPath = await realpath(candidate);
      } else {
        try {
          await lstat(candidate);
          targetRealPath = await realpath(candidate);
        } catch (error) {
          if (errorCode(error) !== "ENOENT") {
            throw error;
          }
          const parent = resolve(candidate, "..");
          targetRealPath = resolve(await realpath(parent), candidate.slice(parent.length + 1));
        }
      }

      if (!isInside(workspaceRealPath, targetRealPath)) {
        return failure("PATH_OUTSIDE_WORKSPACE", "文件真实路径位于 workspace 之外");
      }

      return { ok: true, value: targetRealPath };
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return failure("PATH_NOT_FOUND", "文件或其父目录不存在");
      }
      return failure("PATH_RESOLUTION_FAILED", "无法安全解析文件路径");
    }
  }
}
