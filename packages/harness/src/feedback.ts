import type { DispatchResult } from "./dispatcher.js";
import type { Redactor } from "./redactor.js";

export type FeedbackCategory = "pass" | "fail" | "timeout" | "environment_error";

export interface FeedbackResult {
  category: FeedbackCategory;
  observation: string;
}

interface ToolFailure {
  ok: false;
  error: { code: string; message?: string };
}

interface CommandOutput {
  exitCode: number | null;
}

interface ToolSuccess {
  ok: true;
  value: unknown;
}

const MAX_OBSERVATION_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolFailure(value: unknown): value is ToolFailure {
  return (
    isRecord(value) &&
    value.ok === false &&
    isRecord(value.error) &&
    typeof value.error.code === "string"
  );
}

function isToolSuccess(value: unknown): value is ToolSuccess {
  return isRecord(value) && value.ok === true && Object.hasOwn(value, "value");
}

function isCommandOutput(value: unknown): value is CommandOutput {
  return (
    isRecord(value) &&
    (typeof value.exitCode === "number" || value.exitCode === null)
  );
}

function observation(redactor: Redactor, value: string): string {
  return redactor.redactText(value).slice(0, MAX_OBSERVATION_LENGTH);
}

function fromFailure(
  redactor: Redactor,
  code: string,
  diagnostic?: string
): FeedbackResult {
  if (code === "COMMAND_TIMEOUT") {
    return { category: "timeout", observation: observation(redactor, "timeout: COMMAND_TIMEOUT") };
  }

  return {
    category: "environment_error",
    observation: observation(
      redactor,
      diagnostic === undefined
        ? `environment_error: ${code}`
        : `environment_error: ${code}: ${diagnostic}`
    )
  };
}

export function classifyFeedback(result: DispatchResult, redactor: Redactor): FeedbackResult {
  if (!result.ok) {
    return fromFailure(redactor, result.error.code);
  }

  if (isToolFailure(result.value)) {
    return fromFailure(redactor, result.value.error.code, result.value.error.message);
  }

  const value = isToolSuccess(result.value) ? result.value.value : result.value;
  if (isCommandOutput(value) && value.exitCode !== null && value.exitCode !== 0) {
    return {
      category: "fail",
      observation: observation(redactor, `fail: command exited ${value.exitCode}`)
    };
  }

  if (isCommandOutput(value) && value.exitCode === null) {
    return {
      category: "environment_error",
      observation: observation(redactor, "environment_error: command exit code unavailable")
    };
  }

  if (isCommandOutput(value)) {
    return {
      category: "pass",
      observation: observation(redactor, "pass: command exited 0")
    };
  }

  return { category: "pass", observation: observation(redactor, "pass: tool completed") };
}
