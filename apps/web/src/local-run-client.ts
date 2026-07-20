export interface LocalRunRequest {
  readonly task: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export type LocalAction =
  | { readonly type: "read_file"; readonly path: string }
  | { readonly type: "write_file"; readonly path: string; readonly content: string }
  | { readonly type: "run_command"; readonly executable: string; readonly args: readonly string[] }
  | { readonly type: "finish"; readonly summary: string };

export interface LocalTraceEntry {
  readonly step: number;
  readonly policy: "allow" | "ask" | "deny";
  readonly observation?: string;
  readonly status: "running" | "completed" | "blocked" | "failed";
  readonly stopReason?: string;
  readonly action?: LocalAction;
}

export interface LocalRunResponse {
  readonly status: "completed" | "blocked" | "failed" | "max_steps";
  readonly summary: string;
  readonly steps: number;
  readonly trace: readonly LocalTraceEntry[];
}

const LOCAL_RUN_ERROR = "本地运行请求失败";
const LOCAL_RESPONSE_ERROR = "本地运行响应格式无效";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isEnumValue(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function isLocalAction(value: unknown): value is LocalAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  switch (value.type) {
    case "read_file":
      return hasExactKeys(value, ["type", "path"]) && typeof value.path === "string";
    case "write_file":
      return hasExactKeys(value, ["type", "path", "content"]) &&
        typeof value.path === "string" && typeof value.content === "string";
    case "run_command":
      return hasExactKeys(value, ["type", "executable", "args"]) &&
        typeof value.executable === "string" && Array.isArray(value.args) &&
        value.args.every((argument) => typeof argument === "string");
    case "finish":
      return hasExactKeys(value, ["type", "summary"]) && typeof value.summary === "string";
    default:
      return false;
  }
}

function isLocalTraceEntry(value: unknown): value is LocalTraceEntry {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (!keys.every((key) => ["step", "action", "policy", "observation", "status", "stopReason"].includes(key))) {
    return false;
  }
  return (
    Number.isInteger(value.step) && (value.step as number) > 0 &&
    isEnumValue(value.policy, ["allow", "ask", "deny"]) &&
    isEnumValue(value.status, ["running", "completed", "blocked", "failed"]) &&
    (value.action === undefined || isLocalAction(value.action)) &&
    (value.observation === undefined || typeof value.observation === "string") &&
    (value.stopReason === undefined || typeof value.stopReason === "string")
  );
}

function isLocalRunResponse(value: unknown): value is LocalRunResponse {
  if (!isRecord(value)) {
    return false;
  }
  const response = value;
  return (
    isEnumValue(response.status, ["completed", "blocked", "failed", "max_steps"]) &&
    typeof response.summary === "string" &&
    Number.isInteger(response.steps) &&
    Array.isArray(response.trace) && response.trace.every(isLocalTraceEntry)
  );
}

function containsApiKey(value: unknown, apiKey: string): boolean {
  if (apiKey.length === 0) {
    return false;
  }
  if (typeof value === "string") {
    return value.includes(apiKey);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsApiKey(item, apiKey));
  }
  return isRecord(value) && Object.values(value).some((item) => containsApiKey(item, apiKey));
}

export async function runLocalAgent(
  request: LocalRunRequest,
  fetchImpl: typeof fetch = fetch
): Promise<LocalRunResponse> {
  let response: Response;
  try {
    response = await fetchImpl("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  } catch {
    throw new Error(LOCAL_RUN_ERROR);
  }
  if (!response.ok) {
    throw new Error(LOCAL_RUN_ERROR);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(LOCAL_RESPONSE_ERROR);
  }
  if (!isLocalRunResponse(body)) {
    throw new Error(LOCAL_RESPONSE_ERROR);
  }
  return body;
}

export async function submitLocalRun(
  request: LocalRunRequest,
  send: (request: LocalRunRequest) => Promise<LocalRunResponse> = runLocalAgent
): Promise<{ readonly apiKey: ""; readonly result?: LocalRunResponse; readonly error?: string }> {
  let outcome: { readonly result?: LocalRunResponse; readonly error?: string };
  try {
    const result = await send(request);
    outcome = containsApiKey(result, request.apiKey)
      ? { error: LOCAL_RUN_ERROR }
      : { result };
  } catch {
    outcome = { error: LOCAL_RUN_ERROR };
  } finally {
    // 无论请求结果如何，调用方都必须用空值覆盖受控 Key。
  }
  return { apiKey: "", ...outcome };
}
