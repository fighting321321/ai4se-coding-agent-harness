import { basename } from "node:path";

export interface CommandRule {
  executable: string;
  args: readonly string[];
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

const DESTRUCTIVE_EXECUTABLES = new Set([
  "del",
  "erase",
  "remove-item",
  "rm",
  "rmdir",
  "unlink"
]);

function executableName(executable: string): string {
  return basename(executable).toLowerCase().replace(/\.exe$/u, "");
}

function normalizedExecutable(executable: string): string {
  return process.platform === "win32" ? executable.toLowerCase() : executable;
}

export function isShellExecutable(executable: string): boolean {
  return SHELL_EXECUTABLES.has(basename(executable).toLowerCase());
}

export function isDestructiveCommand(
  executable: string,
  args: readonly string[]
): boolean {
  const name = executableName(executable);
  return (
    DESTRUCTIVE_EXECUTABLES.has(name) ||
    (name === "git" && args.some((argument) => argument.toLowerCase() === "clean"))
  );
}

export function isCommandAllowed(
  rules: readonly CommandRule[],
  executable: string,
  args: readonly string[]
): boolean {
  const normalized = normalizedExecutable(executable);
  return rules.some(
    (rule) =>
      normalizedExecutable(rule.executable) === normalized &&
      rule.args.length === args.length &&
      rule.args.every((argument, index) => argument === args[index])
  );
}

export function snapshotCommandRules(rules: readonly CommandRule[]): readonly CommandRule[] {
  return rules.map((rule) => ({ executable: rule.executable, args: [...rule.args] }));
}
