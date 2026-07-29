import type { Action } from "./action.js";
import type { LLMInput } from "./llm-provider.js";
import { Redactor } from "./redactor.js";
import type { WorkspaceRule } from "./workspace-rules.js";

export type ConversationMessage =
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: string }
  | { readonly role: "action"; readonly action: Action }
  | { readonly role: "observation"; readonly content: string };

export interface SessionContextOptions {
  readonly redactor?: Redactor;
  readonly systemConstraints?: readonly string[];
  readonly rules?: readonly WorkspaceRule[];
  readonly maxContextChars?: number;
  readonly recentMessageCount?: number;
  readonly maxSummaryChars?: number;
  readonly maxMessageChars?: number;
  readonly maxObservationChars?: number;
}

export interface SessionContextSnapshot {
  readonly currentGoal: string;
  readonly summary: string;
  readonly messages: readonly ConversationMessage[];
}

function freezeMessage(message: ConversationMessage): ConversationMessage {
  if (message.role !== "action") {
    return Object.freeze({ ...message });
  }
  const action = message.action.type === "run_command"
    ? { ...message.action, args: Object.freeze([...message.action.args]) }
    : { ...message.action };
  return Object.freeze({ role: "action", action: Object.freeze(action) as Action });
}

export class SessionContext {
  readonly #redactor: Redactor;
  readonly #messages: ConversationMessage[] = [];
  readonly #systemConstraints: readonly string[];
  readonly #rules: readonly WorkspaceRule[];
  readonly #maxContextChars: number;
  readonly #recentMessageCount: number;
  readonly #maxSummaryChars: number;
  readonly #maxMessageChars: number;
  readonly #maxObservationChars: number;
  #currentGoal = "";
  #summary = "";

  constructor(options: SessionContextOptions = {}) {
    this.#redactor = options.redactor ?? new Redactor();
    this.#systemConstraints = Object.freeze(
      (options.systemConstraints ?? []).map((value) => this.#redactor.redactText(value))
    );
    this.#rules = Object.freeze((options.rules ?? []).map((rule) => Object.freeze({
      ...rule,
      content: this.#redactor.redactText(rule.content)
    })));
    this.#maxContextChars = positiveInteger(options.maxContextChars ?? 24_000, "maxContextChars");
    this.#recentMessageCount = positiveInteger(
      options.recentMessageCount ?? 8,
      "recentMessageCount"
    );
    this.#maxSummaryChars = positiveInteger(options.maxSummaryChars ?? 4_000, "maxSummaryChars");
    this.#maxMessageChars = positiveInteger(options.maxMessageChars ?? 16_000, "maxMessageChars");
    this.#maxObservationChars = positiveInteger(
      options.maxObservationChars ?? 512,
      "maxObservationChars"
    );
  }

  beginTurn(task: string): void {
    this.#currentGoal = this.#boundedText(task, this.#maxMessageChars);
    this.#messages.push({ role: "user", content: this.#currentGoal });
  }

  appendAssistant(content: string): void {
    this.#messages.push({
      role: "assistant",
      content: this.#boundedText(content, this.#maxMessageChars)
    });
  }

  appendAction(action: Action): void {
    this.#messages.push({ role: "action", action: this.#redactor.redact(action) });
  }

  appendObservation(content: string): void {
    this.#messages.push({
      role: "observation",
      content: this.#boundedText(content, this.#maxObservationChars)
    });
  }

  reset(): void {
    this.#messages.length = 0;
    this.#currentGoal = "";
    this.#summary = "";
  }

  snapshot(): SessionContextSnapshot {
    return Object.freeze({
      currentGoal: this.#currentGoal,
      summary: this.#summary,
      messages: Object.freeze(this.#messages.map(freezeMessage))
    });
  }

  #boundedText(content: string, limit: number): string {
    return truncate(this.#redactor.redactText(content), limit);
  }

  #estimatedChars(): number {
    return JSON.stringify({
      systemConstraints: this.#systemConstraints,
      rules: this.#rules,
      currentGoal: this.#currentGoal,
      summary: this.#summary,
      messages: this.#messages
    }).length;
  }

  #compactIfNeeded(): void {
    if (
      this.#estimatedChars() <= this.#maxContextChars ||
      this.#messages.length <= this.#recentMessageCount
    ) {
      return;
    }
    const removeCount = this.#messages.length - this.#recentMessageCount;
    const older = this.#messages.splice(0, removeCount);
    const additions = older.map(summarizeMessage);
    const combined = [this.#summary, ...additions].filter((value) => value.length > 0).join("\n");
    this.#summary = truncate(this.#redactor.redactText(combined), this.#maxSummaryChars);
  }

  toLLMInput(task: string, context: readonly string[], observations: readonly string[]): LLMInput {
    this.#compactIfNeeded();
    const snapshot = this.snapshot();
    return {
      task: this.#boundedText(task, this.#maxMessageChars),
      context: context.map((value) => this.#boundedText(value, this.#maxObservationChars)),
      observations: observations.map((value) =>
        this.#boundedText(value, this.#maxObservationChars)
      ),
      currentGoal: snapshot.currentGoal,
      summary: snapshot.summary,
      messages: snapshot.messages,
      systemConstraints: this.#systemConstraints,
      rules: this.#rules
    };
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} 必须是正整数`);
  }
  return value;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 12))}[TRUNCATED]`;
}

function summarizeMessage(message: ConversationMessage): string {
  if (message.role !== "action") {
    return `${message.role}: ${truncate(message.content, 240)}`;
  }
  const action = message.action;
  if (action.type === "read_file") {
    return `action: read_file path=${truncate(action.path, 160)}`;
  }
  if (action.type === "write_file") {
    return `action: write_file path=${truncate(action.path, 160)} content=[OMITTED]`;
  }
  if (action.type === "run_command") {
    return `action: run_command executable=${truncate(action.executable, 160)} args=[OMITTED]`;
  }
  return `action: finish summary=${truncate(action.summary, 240)}`;
}
