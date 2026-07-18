import { basename, isAbsolute } from "node:path";

import type { Action } from "./action.js";

export type PolicyDecision = "allow" | "ask" | "deny";

export interface PolicyEngineOptions {
  allowedExecutables: readonly string[];
}

const SHELL_EXECUTABLES = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "sh",
  "zsh"
]);

const DELETE_COMMANDS = new Set([
  "del",
  "erase",
  "remove-item",
  "rm",
  "rmdir",
  "unlink"
]);

const SENSITIVE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "service-account.json"
]);

function normalizedExecutable(executable: string): string {
  return process.platform === "win32" ? executable.toLowerCase() : executable;
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/u).filter((segment) => segment.length > 0);
}

function isDeniedPath(path: string): boolean {
  if (path.length === 0 || path.includes("\0") || isAbsolute(path)) {
    return true;
  }

  return pathSegments(path).some((segment) => {
    const normalized = segment.toLowerCase();
    return (
      normalized === ".." ||
      SENSITIVE_NAMES.has(normalized) ||
      normalized.startsWith(".env.")
    );
  });
}

function isDangerousCommand(executable: string, args: readonly string[]): boolean {
  const executableName = basename(executable).toLowerCase();
  if (SHELL_EXECUTABLES.has(executableName) || DELETE_COMMANDS.has(executableName)) {
    return true;
  }

  return args.some((argument) => DELETE_COMMANDS.has(argument.toLowerCase()));
}

export class PolicyEngine {
  readonly #allowedExecutables: ReadonlySet<string>;

  constructor(options: PolicyEngineOptions) {
    this.#allowedExecutables = new Set(options.allowedExecutables.map(normalizedExecutable));
  }

  evaluate(action: Action): PolicyDecision {
    switch (action.type) {
      case "read_file":
        return isDeniedPath(action.path) ? "deny" : "allow";
      case "write_file":
        return isDeniedPath(action.path) ? "deny" : "ask";
      case "run_command":
        if (
          isDangerousCommand(action.executable, action.args) ||
          !this.#allowedExecutables.has(normalizedExecutable(action.executable))
        ) {
          return "deny";
        }
        return "allow";
      case "finish":
        return "allow";
    }
  }
}
