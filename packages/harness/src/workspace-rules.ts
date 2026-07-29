import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface WorkspaceRule {
  readonly source: string;
  readonly scope: string;
  readonly content: string;
  readonly priority: number;
}

const RULE_NAMES = ["CLAUDE.md", "AGENTS.md"] as const;
const MAX_RULE_BYTES = 64 * 1024;

function safeScope(value: string): readonly string[] | undefined {
  if (value.includes("\0") || isAbsolute(value) || /^[a-z]:/iu.test(value)) {
    return undefined;
  }
  const segments = value.split(/[\\/]+/u).filter((segment) => segment.length > 0 && segment !== ".");
  return segments.includes("..") ? undefined : segments;
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function portable(path: string): string {
  return path.split(sep).join("/");
}

export async function loadWorkspaceRules(
  workspace: string,
  activeScope = "."
): Promise<readonly WorkspaceRule[]> {
  const segments = safeScope(activeScope);
  if (segments === undefined) {
    return [];
  }

  let root: string;
  try {
    root = await realpath(resolve(workspace));
  } catch {
    return [];
  }

  const scopes = ["."];
  for (let index = 1; index <= segments.length; index += 1) {
    scopes.push(segments.slice(0, index).join("/"));
  }

  const rules: WorkspaceRule[] = [];
  for (const scope of scopes) {
    const directory = scope === "." ? root : join(root, ...scope.split("/"));
    for (const name of RULE_NAMES) {
      const candidate = join(directory, name);
      try {
        const resolvedRule = await realpath(candidate);
        if (!inside(root, resolvedRule)) {
          continue;
        }
        const metadata = await stat(resolvedRule);
        if (!metadata.isFile()) {
          continue;
        }
        const raw = await readFile(resolvedRule);
        const bounded = raw.subarray(0, MAX_RULE_BYTES).toString("utf8").replace(/^\uFEFF/u, "");
        rules.push(Object.freeze({
          source: portable(relative(root, candidate)),
          scope,
          content: metadata.size > MAX_RULE_BYTES
            ? `${bounded}\n[规则文件已按安全上限截断]`
            : bounded,
          priority: rules.length
        }));
      } catch {
        // 缺失、不可读或变化中的规则文件不阻止离线启动。
      }
    }
  }
  return Object.freeze(rules);
}
