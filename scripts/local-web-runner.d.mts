import type { ChildProcess } from "node:child_process";

export interface LocalWebRuntime {
  readonly env: NodeJS.ProcessEnv;
  readonly execPath: string;
  exitCode?: number;
  once(signal: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

export interface StartLocalWebOptions {
  readonly runtime?: LocalWebRuntime;
  readonly spawnProcess?: (
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly stdio: "inherit";
      readonly env: NodeJS.ProcessEnv;
      readonly shell: false;
    }
  ) => ChildProcess;
  readonly log?: (message: string) => void;
  readonly rootDir?: string;
}

export function startLocalWeb(options?: StartLocalWebOptions): void;
