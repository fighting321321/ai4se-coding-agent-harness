#!/usr/bin/env node

import console from "node:console";
import process from "node:process";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";

import { formatApprovalRequest, runCli } from "../dist/index.js";

async function readSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("隐藏输入需要 TTY");
  }
  const input = process.stdin;
  const previousRawMode = input.isRaw;
  process.stdout.write(`${prompt}：`);
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  return await new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
      process.stdout.write("\n");
    };
    const onKeypress = (character, key) => {
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

async function question(message) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await prompt.question(message);
  } finally {
    prompt.close();
  }
}

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  isTty: process.stdin.isTTY === true && process.stdout.isTTY === true,
  readSecret,
  readLine: question,
  askApproval: async (request) =>
    (await question(`${formatApprovalRequest(request)}。是否批准？[y/N] `))
      .trim()
      .toLowerCase() === "y",
  clearScreen: () => console.clear(),
  writeOut: (message) => console.log(message),
  writeError: (message) => console.error(message)
});
