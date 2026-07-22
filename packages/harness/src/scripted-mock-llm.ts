import type { LLMInput, LLMOutput, LLMProvider } from "./llm-provider.js";

export class ScriptedMockExhaustedError extends Error {
  constructor() {
    super("ScriptedMockLLM 脚本已耗尽");
    this.name = "ScriptedMockExhaustedError";
  }
}

function snapshotInput(input: LLMInput): LLMInput {
  return Object.freeze({
    task: input.task,
    context: Object.freeze([...input.context]),
    observations: Object.freeze([...input.observations])
  });
}

export class ScriptedMockLLM implements LLMProvider {
  readonly #script: readonly LLMOutput[];
  readonly #calls: LLMInput[] = [];
  #position = 0;

  constructor(script: readonly LLMOutput[]) {
    this.#script = [...script];
  }

  get calls(): readonly LLMInput[] {
    return Object.freeze([...this.#calls]);
  }

  async complete(input: LLMInput): Promise<LLMOutput> {
    this.#calls.push(snapshotInput(input));

    const output = this.#script[this.#position];
    if (output === undefined) {
      throw new ScriptedMockExhaustedError();
    }

    this.#position += 1;
    return output;
  }
}
