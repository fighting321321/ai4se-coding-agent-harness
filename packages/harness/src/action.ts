export type Action =
  | { type: "read_file"; path: string }
  | { type: "write_file"; path: string; content: string }
  | { type: "run_command"; executable: string; args: readonly string[] }
  | { type: "load_skill"; name: string }
  | {
      type: "call_mcp";
      server: string;
      tool: string;
      arguments: Readonly<Record<string, unknown>>;
    }
  | { type: "finish"; summary: string };
