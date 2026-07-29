import type { ConversationMessage } from "./session-context.js";
import type { WorkspaceRule } from "./workspace-rules.js";

export interface LLMInput {
  task: string;
  context: readonly string[];
  observations: readonly string[];
  currentGoal?: string;
  summary?: string;
  messages?: readonly ConversationMessage[];
  systemConstraints?: readonly string[];
  rules?: readonly WorkspaceRule[];
}

export interface LLMOutput {
  raw: unknown;
  assistantText?: string;
}

export interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}
