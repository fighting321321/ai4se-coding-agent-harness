import type { LLMInput, LLMOutput, LLMProvider } from "./llm-provider.js";

export interface OpenAICompatibleProviderOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export type OpenAICompatibleProviderErrorCode =
  | "PROVIDER_INVALID_CONFIG"
  | "PROVIDER_AUTHENTICATION_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_SERVER_ERROR"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_NETWORK_ERROR"
  | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_ACTION_INVALID";

export class OpenAICompatibleProviderError extends Error {
  readonly code: OpenAICompatibleProviderErrorCode;

  constructor(code: OpenAICompatibleProviderErrorCode, message: string) {
    super(message);
    this.name = "OpenAICompatibleProviderError";
    this.code = code;
  }
}

function providerError(
  code: OpenAICompatibleProviderErrorCode,
  message: string
): OpenAICompatibleProviderError {
  return new OpenAICompatibleProviderError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const HTTP_LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]"
]);

export function validProviderBaseUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" ||
        (url.protocol === "http:" && HTTP_LOOPBACK_HOSTNAMES.has(url.hostname))) &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

function endpointFromBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw providerError("PROVIDER_INVALID_CONFIG", "Provider baseUrl 配置无效");
  }
  if (!validProviderBaseUrl(baseUrl)) {
    throw providerError("PROVIDER_INVALID_CONFIG", "Provider baseUrl 配置无效");
  }

  const basePath = url.pathname.replace(/\/+$/u, "");
  url.pathname = basePath.endsWith("/v1/chat/completions")
    ? basePath
    : basePath.endsWith("/v1")
      ? `${basePath}/chat/completions`
      : `${basePath}/v1/chat/completions`;
  return url.toString();
}

function errorForStatus(status: number): OpenAICompatibleProviderError {
  if (status === 401) {
    return providerError("PROVIDER_AUTHENTICATION_FAILED", "Provider 鉴权失败");
  }
  if (status === 429) {
    return providerError("PROVIDER_RATE_LIMITED", "Provider 请求频率受限");
  }
  if (status >= 500 && status <= 599) {
    return providerError("PROVIDER_SERVER_ERROR", "Provider 服务端错误");
  }
  return providerError("PROVIDER_HTTP_ERROR", "Provider HTTP 请求失败");
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly #endpoint: string;
  readonly #model: string;
  readonly #apiKey: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.#endpoint = endpointFromBaseUrl(options.baseUrl);
    if (options.model.trim().length === 0 || options.apiKey.length === 0) {
      throw providerError("PROVIDER_INVALID_CONFIG", "Provider 配置无效");
    }
    this.#model = options.model;
    this.#apiKey = options.apiKey;
  }

  async complete(input: LLMInput): Promise<LLMOutput> {
    let response: Response;
    try {
      response = await fetch(this.#endpoint, {
        method: "POST",
        redirect: "manual",
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.#model,
          messages: [
            {
              role: "system",
              content: "你是本地编码智能体。只返回一个 JSON Action 对象。"
            },
            {
              role: "user",
              content: JSON.stringify({
                task: input.task,
                context: [...input.context],
                observations: [...input.observations]
              })
            }
          ]
        })
      });
    } catch {
      throw providerError("PROVIDER_NETWORK_ERROR", "Provider 网络请求失败");
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw errorForStatus(response.status);
    }

    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw providerError("PROVIDER_RESPONSE_INVALID", "Provider 响应不是有效 JSON");
    }
    if (!isRecord(envelope) || !Array.isArray(envelope.choices) || envelope.choices.length === 0) {
      throw providerError("PROVIDER_RESPONSE_INVALID", "Provider 响应结构无效");
    }
    const choice = envelope.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) {
      throw providerError("PROVIDER_RESPONSE_INVALID", "Provider 响应结构无效");
    }
    const content = choice.message.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw providerError("PROVIDER_RESPONSE_INVALID", "Provider 响应 content 无效");
    }

    let action: unknown;
    try {
      action = JSON.parse(content) as unknown;
    } catch {
      throw providerError("PROVIDER_ACTION_INVALID", "Provider Action JSON 无效");
    }
    if (!isRecord(action)) {
      throw providerError("PROVIDER_ACTION_INVALID", "Provider Action 必须是对象");
    }
    return { raw: action };
  }
}
