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
    observations: Object.freeze([...input.observations]),
    ...(input.currentGoal === undefined ? {} : { currentGoal: input.currentGoal }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.systemConstraints === undefined
      ? {}
      : { systemConstraints: Object.freeze([...input.systemConstraints]) }),
    ...(input.rules === undefined
      ? {}
      : { rules: Object.freeze(input.rules.map((rule) => Object.freeze({ ...rule }))) }),
    ...(input.capabilities === undefined
      ? {}
      : {
          capabilities: Object.freeze({
            builtins: Object.freeze([...input.capabilities.builtins]),
            skills: Object.freeze(input.capabilities.skills.map((card) => Object.freeze({ ...card }))),
            mcp: Object.freeze(input.capabilities.mcp.map((card) => Object.freeze({ ...card })))
          })
        }),
    ...(input.skillInstructions === undefined
      ? {}
      : { skillInstructions: Object.freeze([...input.skillInstructions]) }),
    ...(input.messages === undefined
      ? {}
      : {
          messages: Object.freeze(input.messages.map((message) => {
            if (message.role !== "action") {
              return Object.freeze({ ...message });
            }
            return Object.freeze({
              role: "action" as const,
              action: Object.freeze(message.action.type === "run_command"
                ? { ...message.action, args: Object.freeze([...message.action.args]) }
                : message.action.type === "call_mcp"
                  ? { ...message.action, arguments: Object.freeze(structuredClone(message.action.arguments)) }
                  : { ...message.action })
            });
          }))
        })
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
