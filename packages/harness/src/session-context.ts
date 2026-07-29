import type { Action } from "./action.js";
import type { LLMInput } from "./llm-provider.js";
import { Redactor } from "./redactor.js";

export type ConversationMessage =
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: string }
  | { readonly role: "action"; readonly action: Action }
  | { readonly role: "observation"; readonly content: string };

export interface SessionContextOptions {
  readonly redactor?: Redactor;
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
  #currentGoal = "";
  #summary = "";

  constructor(options: SessionContextOptions = {}) {
    this.#redactor = options.redactor ?? new Redactor();
  }

  beginTurn(task: string): void {
    this.#currentGoal = this.#redactor.redactText(task);
    this.#messages.push({ role: "user", content: this.#currentGoal });
  }

  appendAssistant(content: string): void {
    this.#messages.push({ role: "assistant", content: this.#redactor.redactText(content) });
  }

  appendAction(action: Action): void {
    this.#messages.push({ role: "action", action: this.#redactor.redact(action) });
  }

  appendObservation(content: string): void {
    this.#messages.push({ role: "observation", content: this.#redactor.redactText(content) });
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

  toLLMInput(task: string, context: readonly string[], observations: readonly string[]): LLMInput {
    const snapshot = this.snapshot();
    return {
      task,
      context,
      observations,
      currentGoal: snapshot.currentGoal,
      summary: snapshot.summary,
      messages: snapshot.messages
    };
  }
}
