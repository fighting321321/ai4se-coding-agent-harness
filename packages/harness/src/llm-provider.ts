import type { ConversationMessage } from "./session-context.js";

export interface LLMInput {
  task: string;
  context: readonly string[];
  observations: readonly string[];
  currentGoal?: string;
  summary?: string;
  messages?: readonly ConversationMessage[];
}

export interface LLMOutput {
  raw: unknown;
  assistantText?: string;
}

export interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}
