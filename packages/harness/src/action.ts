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
  | {
      type: "delegate_agent";
      task: string;
      allowedTools: readonly ("read_file" | "write_file" | "run_command" | "load_skill" | "call_mcp")[];
    }
  | { type: "finish"; summary: string };
