export interface LLMInput {
  task: string;
  context: readonly string[];
  observations: readonly string[];
}

export interface LLMOutput {
  raw: unknown;
}

export interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}
