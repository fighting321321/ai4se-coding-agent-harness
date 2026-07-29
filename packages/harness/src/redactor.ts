const REDACTED = "[REDACTED]";

function redactStructuredValue(value: unknown, redactText: (text: string) => string): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactStructuredValue(item, redactText));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactStructuredValue(item, redactText)
      ])
    );
  }

  return value;
}

export class Redactor {
  readonly #sensitiveValues: readonly string[];

  constructor(sensitiveValues: readonly string[] = []) {
    this.#sensitiveValues = [...new Set(sensitiveValues.filter((value) => value.length > 0))]
      .sort((left, right) => right.length - left.length);
  }

  redactText(text: string): string {
    let redacted = text;
    for (const sensitiveValue of this.#sensitiveValues) {
      redacted = redacted.split(sensitiveValue).join(REDACTED);
    }

    redacted = redacted.replace(
      /\bBearer\s+[^\s"',;]+/giu,
      `Bearer ${REDACTED}`
    );
    redacted = redacted.replace(
      /\b((?:x[-_])?api[-_ ]?key)\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
      (_match, label: string, separator: string) => `${label}${separator} ${REDACTED}`
    );
    redacted = redacted.replace(
      /\b(password|passwd|pwd|token|secret)\s*(is|[:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,
      (_match, label: string, separator: string) =>
        separator.toLocaleLowerCase() === "is"
          ? `${label} is ${REDACTED}`
          : `${label}${separator}${REDACTED}`
    );
    redacted = redacted.replace(
      /(密码|口令|令牌|密钥)\s*(是|[:：=])\s*(?:"[^"]*"|'[^']*'|[^\s，,；;]+)/gu,
      (_match, label: string, separator: string) => `${label}${separator}${REDACTED}`
    );
    redacted = redacted.replace(/\bsk-(?:proj-)?[a-z0-9_-]{8,}\b/giu, REDACTED);

    return redacted;
  }

  redact<T>(value: T): T {
    return redactStructuredValue(value, (text) => this.redactText(text)) as T;
  }

  containsSensitive(value: unknown): boolean {
    return JSON.stringify(this.redact(value)) !== JSON.stringify(value);
  }
}
