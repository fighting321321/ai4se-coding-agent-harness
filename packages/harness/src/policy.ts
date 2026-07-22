import { isAbsolute } from "node:path";

import type { Action } from "./action.js";
import {
  isCommandAllowed,
  isDestructiveCommand,
  isShellExecutable,
  snapshotCommandRules,
  type CommandRule
} from "./command-rule.js";
import { isSensitivePath } from "./sensitive-path.js";

export type PolicyDecision = "allow" | "ask" | "deny";

export interface PolicyEngineOptions {
  allowedCommands: readonly CommandRule[];
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/u).filter((segment) => segment.length > 0);
}

function isDeniedPath(path: string): boolean {
  if (path.length === 0 || path.includes("\0") || isAbsolute(path)) {
    return true;
  }

  return pathSegments(path).some((segment) => {
    return segment === "..";
  }) || isSensitivePath(path);
}

export class PolicyEngine {
  readonly #allowedCommands: readonly CommandRule[];

  constructor(options: PolicyEngineOptions) {
    this.#allowedCommands = snapshotCommandRules(options.allowedCommands);
  }

  evaluate(action: Action): PolicyDecision {
    switch (action.type) {
      case "read_file":
        return isDeniedPath(action.path) ? "deny" : "allow";
      case "write_file":
        return isDeniedPath(action.path) ? "deny" : "ask";
      case "run_command":
        if (
          isShellExecutable(action.executable) ||
          isDestructiveCommand(action.executable, action.args) ||
          !isCommandAllowed(this.#allowedCommands, action.executable, action.args)
        ) {
          return "deny";
        }
        return "allow";
      case "finish":
        return "allow";
    }
  }
}
