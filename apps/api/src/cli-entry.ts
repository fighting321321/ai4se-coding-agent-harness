import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";

import { runCli, type CliDependencies } from "./cli.js";

async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("隐藏输入需要 TTY");
  }
  const input = process.stdin;
  const previousRawMode = input.isRaw;
  process.stdout.write(`${prompt}：`);
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
      process.stdout.write("\n");
    };
    const onKeypress = (
      character: string | undefined,
      key: { readonly name?: string; readonly ctrl?: boolean }
    ): void => {
      if (key.ctrl === true && key.name === "c") {
        cleanup();
        reject(new Error("输入已取消"));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
        return;
      }
      if (key.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (character !== undefined && !/\p{C}/u.test(character)) {
        value += character;
      }
    };
    input.on("keypress", onKeypress);
  });
}

function processDependencies(): CliDependencies {
  return {
    cwd: process.cwd(),
    readSecret,
    askApproval: async () => {
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return (await prompt.question("是否批准该动作？[y/N] ")).trim().toLowerCase() === "y";
      } finally {
        prompt.close();
      }
    },
    writeOut: (message) => console.log(message),
    writeError: (message) => console.error(message)
  };
}

process.exitCode = await runCli(process.argv.slice(2), processDependencies());
