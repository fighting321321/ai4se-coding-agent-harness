import { join } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";

import { validProviderBaseUrl } from "@ai4se/harness";

import { runHarnessTask } from "./run-task.js";

export interface LocalRunRequest {
  readonly task: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export interface LocalWebServerOptions {
  readonly cwd: string;
  readonly configPath?: string;
  readonly allowedOrigins?: readonly string[];
  readonly runTask?: typeof runHarnessTask;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173"
] as const;

type ErrorCode =
  | "RUN_REQUEST_INVALID"
  | "RUN_ORIGIN_FORBIDDEN"
  | "RUN_CONTENT_TYPE_INVALID"
  | "RUN_REQUEST_TOO_LARGE"
  | "RUN_CONFIG_READ_FAILED"
  | "RUN_CONFIG_INVALID"
  | "RUN_INTERNAL_ERROR";

function errorBody(code: ErrorCode, message: string) {
  return { error: { code, message } };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function isLocalRunRequest(value: unknown): value is LocalRunRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const fields = Object.keys(value);
  if (
    fields.length !== 4 ||
    !fields.every((field) => ["task", "baseUrl", "model", "apiKey"].includes(field))
  ) {
    return false;
  }
  const request = value as Record<string, unknown>;
  return (
    typeof request.task === "string" &&
    request.task.trim().length > 0 &&
    typeof request.baseUrl === "string" &&
    request.baseUrl.trim().length > 0 &&
    validProviderBaseUrl(request.baseUrl) &&
    typeof request.model === "string" &&
    request.model.trim().length > 0 &&
    typeof request.apiKey === "string" &&
    request.apiKey.trim().length > 0
  );
}

export function buildLocalWebServer(options: LocalWebServerOptions): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 32 * 1024 });
  const allowedOrigins = new Set(options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS);
  const configPath = options.configPath ?? join(options.cwd, ".ai4se", "config.json");
  const runTask = options.runTask ?? runHarnessTask;

  app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (errorCode(error) === "FST_ERR_CTP_INVALID_JSON_BODY") {
      return reply.code(400).send(errorBody("RUN_REQUEST_INVALID", "请求参数无效"));
    }
    if (errorCode(error) === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send(errorBody("RUN_REQUEST_TOO_LARGE", "请求内容过大"));
    }
    return reply.code(500).send(errorBody("RUN_INTERNAL_ERROR", "本地任务执行失败"));
  });

  app.post("/api/runs", async (request, reply) => {
    if (!allowedOrigins.has(request.headers.origin ?? "")) {
      return reply.code(403).send(errorBody("RUN_ORIGIN_FORBIDDEN", "请求来源不被允许"));
    }
    if (request.headers["content-type"] !== "application/json") {
      return reply.code(415).send(errorBody("RUN_CONTENT_TYPE_INVALID", "请求内容类型无效"));
    }
    if (!isLocalRunRequest(request.body)) {
      return reply.code(400).send(errorBody("RUN_REQUEST_INVALID", "请求参数无效"));
    }

    try {
      const result = await runTask({
        cwd: options.cwd,
        configPath,
        task: request.body.task,
        provider: {
          apiKey: request.body.apiKey,
          baseUrl: request.body.baseUrl,
          model: request.body.model
        }
      });
      if (!result.ok) {
        return reply.code(422).send(errorBody(
          result.error.code,
          result.error.code === "RUN_CONFIG_READ_FAILED" ? "无法读取本地配置" : "本地配置无效"
        ));
      }
      return reply.code(200).send(result.value);
    } catch {
      return reply.code(500).send(errorBody("RUN_INTERNAL_ERROR", "本地任务执行失败"));
    }
  });

  return app;
}
