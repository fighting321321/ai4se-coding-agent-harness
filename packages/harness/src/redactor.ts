const REDACTED = "[REDACTED]";

const ACTION_PLACEHOLDER = /(?:^|[-_.\s])(?:fake|test|example|dummy|placeholder|redacted)(?:$|[-_.\s])/iu;
const ACTION_SK_TOKEN = /\bsk-(?:proj-)?[a-z0-9_-]{8,}\b/giu;
const ACTION_BEARER_TOKEN = /\bBearer\s+([^\s"',;]{12,})/giu;
const ACTION_QUOTED_CREDENTIAL =
  /\b(?:api[-_ ]?key|password|passwd|pwd|token|secret)\b\s*(?:is|[:=])\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)')/giu;

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

function someString(value: unknown, predicate: (text: string) => boolean): boolean {
  if (typeof value === "string") {
    return predicate(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => someString(item, predicate));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((item) => someString(item, predicate));
  }
  return false;
}

function isPlaceholder(value: string): boolean {
  return value === REDACTED || ACTION_PLACEHOLDER.test(value);
}

function looksLikeQuotedCredential(value: string): boolean {
  return (
    value.length >= 16 &&
    !/\s/u.test(value) &&
    /[a-z]/iu.test(value) &&
    /\d/u.test(value) &&
    !isPlaceholder(value)
  );
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

  containsSensitiveAction(
    value: unknown,
    options: { readonly allowCredentialFixtures?: boolean } = {}
  ): boolean {
    return someString(value, (text) => {
      if (this.#sensitiveValues.some((sensitiveValue) => text.includes(sensitiveValue))) {
        return true;
      }

      if (options.allowCredentialFixtures === true) {
        return false;
      }

      for (const match of text.matchAll(ACTION_SK_TOKEN)) {
        if (!isPlaceholder(match[0])) return true;
      }
      for (const match of text.matchAll(ACTION_BEARER_TOKEN)) {
        if (!isPlaceholder(match[1] ?? "")) return true;
      }
      for (const match of text.matchAll(ACTION_QUOTED_CREDENTIAL)) {
        if (looksLikeQuotedCredential(match[1] ?? match[2] ?? "")) return true;
      }
      return false;
    });
  }
}
