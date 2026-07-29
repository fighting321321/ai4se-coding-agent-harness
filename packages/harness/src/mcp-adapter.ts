import { Redactor } from "./redactor.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const MAX_MCP_TOOLS = 64;

export interface McpToolDescription {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface McpToolCard {
  readonly server: string;
  readonly name: string;
  readonly description: string;
  readonly trust: "external";
}

export interface McpCallRequest {
  readonly server: string;
  readonly tool: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export type McpCallResult =
  | { readonly ok: true; readonly value: { readonly content: string } }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "MCP_CALL_FAILED" | "MCP_TIMEOUT" | "MCP_RESULT_INVALID" | "MCP_TOOL_UNKNOWN";
        readonly message: string;
      };
    };

export interface McpConnection {
  readonly server: string;
  listTools(): Promise<readonly McpToolDescription[]>;
  callTool(request: Omit<McpCallRequest, "server">): Promise<unknown>;
}

export interface MockMcpConnectionOptions {
  readonly server: string;
  readonly tools: readonly McpToolDescription[];
  readonly responses: readonly unknown[];
}

export class MockMcpConnection implements McpConnection {
  readonly server: string;
  readonly #tools: readonly McpToolDescription[];
  readonly #responses: readonly unknown[];
  readonly #calls: Array<Omit<McpCallRequest, "server">> = [];
  #position = 0;

  constructor(options: MockMcpConnectionOptions) {
    this.server = options.server;
    this.#tools = [...options.tools];
    this.#responses = [...options.responses];
  }

  get calls(): readonly Omit<McpCallRequest, "server">[] {
    return this.#calls.map((call) => ({ ...call, arguments: { ...call.arguments } }));
  }

  async listTools(): Promise<readonly McpToolDescription[]> {
    return this.#tools.map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema } }));
  }

  async callTool(request: Omit<McpCallRequest, "server">): Promise<unknown> {
    this.#calls.push({ ...request, arguments: { ...request.arguments } });
    const response = this.#responses[this.#position];
    this.#position += 1;
    return response;
  }
}

export class McpRegistry {
  readonly #connections: readonly McpConnection[];
  readonly #redactor: Redactor;
  readonly #tools = new Set<string>();

  constructor(
    connections: readonly McpConnection[],
    options: { readonly redactor?: Redactor; readonly redactorValues?: readonly string[] } = {}
  ) {
    this.#connections = [...connections];
    this.#redactor = options.redactor ?? new Redactor(options.redactorValues);
  }

  async discover(): Promise<
    | { readonly ok: true; readonly value: readonly McpToolCard[] }
    | { readonly ok: false; readonly error: { readonly code: "MCP_DISCOVERY_FAILED"; readonly message: string } }
  > {
    const cards: McpToolCard[] = [];
    this.#tools.clear();
    try {
      for (const connection of this.#connections) {
        if (!ID_PATTERN.test(connection.server)) {
          throw new Error("invalid server");
        }
        for (const tool of await connection.listTools()) {
          if (cards.length >= MAX_MCP_TOOLS) {
            break;
          }
          if (
            !ID_PATTERN.test(tool.name) ||
            typeof tool.description !== "string" ||
            tool.description.trim().length === 0
          ) {
            throw new Error("invalid tool");
          }
          const key = `${connection.server}\0${tool.name}`;
          if (this.#tools.has(key)) {
            throw new Error("duplicate tool");
          }
          this.#tools.add(key);
          cards.push({
            server: connection.server,
            name: tool.name,
            description: this.#truncate(this.#redactor.redactText(tool.description), 240),
            trust: "external"
          });
        }
      }
      return {
        ok: true,
        value: cards.sort((left, right) =>
          left.server.localeCompare(right.server) || left.name.localeCompare(right.name)
        )
      };
    } catch {
      return { ok: false, error: { code: "MCP_DISCOVERY_FAILED", message: "MCP 工具发现失败" } };
    }
  }

  async call(request: McpCallRequest): Promise<McpCallResult> {
    const key = `${request.server}\0${request.tool}`;
    const connection = this.#connections.find((item) => item.server === request.server);
    if (!this.#tools.has(key) || connection === undefined) {
      return { ok: false, error: { code: "MCP_TOOL_UNKNOWN", message: "MCP 工具未发现" } };
    }
    let raw: unknown;
    try {
      raw = await connection.callTool({ tool: request.tool, arguments: { ...request.arguments } });
    } catch {
      return { ok: false, error: { code: "MCP_CALL_FAILED", message: "MCP 工具调用失败" } };
    }
    if (this.#isSuccess(raw)) {
      return { ok: true, value: { content: this.#truncate(this.#redactor.redactText(raw.value.content), 4_096) } };
    }
    if (this.#isFailure(raw)) {
      return raw.error.code === "MCP_TIMEOUT"
        ? { ok: false, error: { code: "MCP_TIMEOUT", message: "MCP 工具调用超时" } }
        : { ok: false, error: { code: "MCP_CALL_FAILED", message: "MCP 工具调用失败" } };
    }
    return { ok: false, error: { code: "MCP_RESULT_INVALID", message: "MCP 工具返回无效结果" } };
  }

  #isSuccess(value: unknown): value is { ok: true; value: { content: string } } {
    return typeof value === "object" && value !== null && "ok" in value && value.ok === true &&
      "value" in value && typeof value.value === "object" && value.value !== null &&
      "content" in value.value && typeof value.value.content === "string";
  }

  #isFailure(value: unknown): value is { ok: false; error: { code: string } } {
    return typeof value === "object" && value !== null && "ok" in value && value.ok === false &&
      "error" in value && typeof value.error === "object" && value.error !== null &&
      "code" in value.error && typeof value.error.code === "string";
  }

  #truncate(value: string, limit: number): string {
    return value.length <= limit ? value : `${value.slice(0, limit - 12)}[TRUNCATED]`;
  }
}
