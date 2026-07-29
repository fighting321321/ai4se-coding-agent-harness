import type { ConversationMessage } from "./session-context.js";
import type { WorkspaceRule } from "./workspace-rules.js";
import type { McpToolCard } from "./mcp-adapter.js";
import type { SkillCard } from "./skill-registry.js";

export interface CapabilityMenu {
  readonly builtins: readonly string[];
  readonly skills: readonly SkillCard[];
  readonly mcp: readonly McpToolCard[];
}

export interface LLMInput {
  task: string;
  context: readonly string[];
  observations: readonly string[];
  currentGoal?: string;
  summary?: string;
  messages?: readonly ConversationMessage[];
  systemConstraints?: readonly string[];
  rules?: readonly WorkspaceRule[];
  capabilities?: CapabilityMenu;
  skillInstructions?: readonly string[];
}

export interface LLMOutput {
  raw: unknown;
  assistantText?: string;
}

export interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}
