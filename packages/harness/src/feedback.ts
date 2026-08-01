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
  stdout?: string;
  stderr?: string;
}

interface ToolSuccess {
  ok: true;
  value: unknown;
}

type GovernedToolResult = ToolSuccess | ToolFailure;

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
    (typeof value.exitCode === "number" || value.exitCode === null) &&
    (value.stdout === undefined || typeof value.stdout === "string") &&
    (value.stderr === undefined || typeof value.stderr === "string")
  );
}

function commandDiagnostic(value: CommandOutput): string | undefined {
  const parts = [value.stderr, value.stdout]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length === 0 ? undefined : parts.join(" | ");
}

function successfulCommandOutput(value: CommandOutput): string | undefined {
  const parts = [value.stdout, value.stderr]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length === 0 ? undefined : parts.join(" | ");
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

export function classifyFeedback(result: GovernedToolResult, redactor: Redactor): FeedbackResult {
  if (!result.ok) {
    return fromFailure(redactor, result.error.code);
  }

  if (isToolFailure(result.value)) {
    return fromFailure(redactor, result.value.error.code, result.value.error.message);
  }

  const value = isToolSuccess(result.value) ? result.value.value : result.value;
  if (isCommandOutput(value) && value.exitCode !== null && value.exitCode !== 0) {
    const diagnostic = commandDiagnostic(value);
    return {
      category: "fail",
      observation: observation(
        redactor,
        diagnostic === undefined
          ? `fail: command exited ${value.exitCode}`
          : `fail: command exited ${value.exitCode}: ${diagnostic}`
      )
    };
  }

  if (isCommandOutput(value) && value.exitCode === null) {
    return {
      category: "environment_error",
      observation: observation(redactor, "environment_error: command exit code unavailable")
    };
  }

  if (isCommandOutput(value)) {
    const output = successfulCommandOutput(value);
    return {
      category: "pass",
      observation: observation(
        redactor,
        output === undefined
          ? "pass: command exited 0"
          : `pass: command exited 0: ${output}`
      )
    };
  }

  if (typeof value === "string" && value.length > 0) {
    return {
      category: "pass",
      observation: observation(redactor, `pass: tool completed: ${value}`)
    };
  }

  return { category: "pass", observation: observation(redactor, "pass: tool completed") };
}
