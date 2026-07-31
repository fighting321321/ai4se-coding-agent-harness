import type { CommandToolResult } from "./command-tool.js";
import { isDestructiveCommand, isShellExecutable } from "./command-rule.js";
import { Redactor } from "./redactor.js";

export interface SensorConfig {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly enabled?: boolean;
}

export type SensorExecutor = (
  executable: string,
  args: readonly string[]
) => Promise<CommandToolResult>;

export interface SensorObservation {
  readonly name: string;
  readonly category: "pass" | "fail" | "timeout" | "environment_error";
  readonly observation: string;
  readonly truncated: boolean;
}

export interface FeedbackSensorSuiteOptions {
  readonly sensors: readonly SensorConfig[];
  readonly execute: SensorExecutor;
  readonly redactor?: Redactor;
  readonly maxObservationChars?: number;
}

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

function bounded(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 12))}[TRUNCATED]`;
}

export class FeedbackSensorSuite {
  readonly #sensors: readonly SensorConfig[];
  readonly #execute: SensorExecutor;
  readonly #redactor: Redactor;
  readonly #maxObservationChars: number;

  constructor(options: FeedbackSensorSuiteOptions) {
    const names = new Set<string>();
    for (const sensor of options.sensors) {
      if (
        !NAME.test(sensor.name) || names.has(sensor.name) || sensor.executable.length === 0 ||
        sensor.executable.includes("\0") || !sensor.args.every((arg) => typeof arg === "string" && !arg.includes("\0")) ||
        isShellExecutable(sensor.executable) || isDestructiveCommand(sensor.executable, sensor.args)
      ) {
        throw new Error("Sensor 配置无效");
      }
      names.add(sensor.name);
    }
    this.#sensors = Object.freeze(options.sensors.map((sensor) => Object.freeze({
      ...sensor, args: Object.freeze([...sensor.args])
    })));
    this.#execute = options.execute;
    this.#redactor = options.redactor ?? new Redactor();
    this.#maxObservationChars = options.maxObservationChars ?? 512;
    if (!Number.isInteger(this.#maxObservationChars) || this.#maxObservationChars < 32) {
      throw new Error("maxObservationChars 必须是至少 32 的整数");
    }
  }

  async run(): Promise<readonly SensorObservation[]> {
    const observations: SensorObservation[] = [];
    for (const sensor of this.#sensors) {
      if (sensor.enabled === false) continue;
      let result: CommandToolResult;
      try {
        result = await this.#execute(sensor.executable, sensor.args);
      } catch {
        result = {
          ok: false,
          error: { code: "COMMAND_EXECUTION_FAILED", message: "Sensor 执行器失败" }
        };
      }
      let category: SensorObservation["category"];
      let diagnostic: string;
      let truncated = false;
      if (!result.ok) {
        category = result.error.code === "COMMAND_TIMEOUT" ? "timeout" : "environment_error";
        diagnostic = result.error.code;
      } else {
        category = result.value.exitCode === 0 ? "pass" : result.value.exitCode === null ? "environment_error" : "fail";
        const output = [result.value.stderr, result.value.stdout].find((value) => value.trim().length > 0);
        diagnostic = output === undefined ? `exit=${String(result.value.exitCode)}` : output.trim();
        truncated = result.value.truncated;
      }
      const text = this.#redactor.redactText(`${category}: sensor ${sensor.name}: ${diagnostic}`);
      observations.push(Object.freeze({
        name: sensor.name,
        category,
        observation: bounded(text, this.#maxObservationChars),
        truncated: truncated || text.length > this.#maxObservationChars
      }));
    }
    return Object.freeze(observations);
  }
}
