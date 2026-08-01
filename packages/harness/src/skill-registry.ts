import { lstat, open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

const MAX_SKILL_BYTES = 64 * 1024;
const MAX_HEADER_BYTES = 4 * 1024;
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const MAX_SKILLS = 32;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function decodeUtf8(value: Uint8Array): string | undefined {
  try {
    return UTF8_DECODER.decode(value);
  } catch {
    return undefined;
  }
}

export interface SkillCard {
  readonly name: string;
  readonly description: string;
}

export type SkillErrorCode =
  | "SKILL_NAME_INVALID"
  | "SKILL_NOT_FOUND"
  | "SKILL_INVALID"
  | "SKILL_TOO_LARGE"
  | "SKILL_OUTSIDE_WORKSPACE"
  | "SKILL_IO_ERROR";

export type SkillResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: { readonly code: SkillErrorCode; readonly message: string } };

function failure<Value>(code: SkillErrorCode, message: string): SkillResult<Value> {
  return { ok: false, error: { code, message } };
}

function within(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function parseCard(source: string, expectedName: string): SkillCard | undefined {
  const matched = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (matched?.[1] === undefined) {
    return undefined;
  }
  const values = new Map<string, string>();
  for (const line of matched[1].split(/\r?\n/u)) {
    const field = line.match(/^([a-z]+):\s*(.+)$/u);
    if (field?.[1] === undefined || field[2] === undefined || values.has(field[1])) {
      return undefined;
    }
    values.set(field[1], field[2].trim());
  }
  if (values.size !== 2 || values.get("name") !== expectedName) {
    return undefined;
  }
  const description = values.get("description") ?? "";
  if (description.length < 1 || description.length > 240 || /[\0\r\n]/u.test(description)) {
    return undefined;
  }
  return { name: expectedName, description };
}

export class SkillRegistry {
  readonly #workspace: string;
  readonly #skillsRoot: string;
  readonly #loaded = new Map<string, string>();

  constructor(workspace: string, directory = join(".ai4se", "skills")) {
    this.#workspace = resolve(workspace);
    this.#skillsRoot = resolve(this.#workspace, directory);
    if (!within(this.#workspace, this.#skillsRoot)) {
      throw new Error("Skill 目录必须位于工作区内");
    }
  }

  async discover(): Promise<SkillResult<readonly SkillCard[]>> {
    let names: string[];
    try {
      names = await readdir(this.#skillsRoot);
    } catch (error) {
      return this.#isMissing(error)
        ? { ok: true, value: [] }
        : failure("SKILL_IO_ERROR", "无法发现 Skill");
    }
    const cards: SkillCard[] = [];
    for (const name of names.sort()) {
      if (cards.length >= MAX_SKILLS) {
        break;
      }
      if (!NAME_PATTERN.test(name)) {
        continue;
      }
      const card = await this.#readCard(name);
      if (card.ok) {
        cards.push(card.value);
      }
    }
    return { ok: true, value: cards.sort((left, right) => left.name.localeCompare(right.name)) };
  }

  async load(name: string): Promise<SkillResult<string>> {
    if (!NAME_PATTERN.test(name)) {
      return failure("SKILL_NAME_INVALID", "Skill 名称无效");
    }
    if (this.#loaded.has(name)) {
      return { ok: true, value: "" };
    }
    const checked = await this.#safePath(name);
    if (!checked.ok) {
      return checked;
    }
    let source: string;
    try {
      const info = await stat(checked.value);
      if (info.size > MAX_SKILL_BYTES) {
        return failure("SKILL_TOO_LARGE", "Skill 文件超过大小限制");
      }
      const decoded = decodeUtf8(await readFile(checked.value));
      if (decoded === undefined) {
        return failure("SKILL_INVALID", "Skill 文件无效");
      }
      source = decoded;
    } catch (error) {
      return this.#isMissing(error)
        ? failure("SKILL_NOT_FOUND", "Skill 不存在")
        : failure("SKILL_IO_ERROR", "无法读取 Skill 文件");
    }
    if (Buffer.byteLength(source, "utf8") > MAX_SKILL_BYTES || parseCard(source, name) === undefined) {
      return Buffer.byteLength(source, "utf8") > MAX_SKILL_BYTES
        ? failure("SKILL_TOO_LARGE", "Skill 文件超过大小限制")
        : failure("SKILL_INVALID", "Skill 文件无效");
    }
    this.#loaded.set(name, source);
    return { ok: true, value: source };
  }

  loadedInstructions(): readonly string[] {
    return [...this.#loaded.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, source]) => source);
  }

  async #readCard(name: string): Promise<SkillResult<SkillCard>> {
    const checked = await this.#safePath(name);
    if (!checked.ok) {
      return checked;
    }
    let handle;
    try {
      const info = await stat(checked.value);
      if (info.size > MAX_SKILL_BYTES) {
        return failure("SKILL_TOO_LARGE", "Skill 文件超过大小限制");
      }
      handle = await open(checked.value, "r");
      const buffer = Buffer.alloc(Math.min(MAX_HEADER_BYTES, info.size));
      await handle.read(buffer, 0, buffer.length, 0);
      const closing = buffer.indexOf(Buffer.from("\n---"), 4);
      const decoded = closing < 0 ? undefined : decodeUtf8(buffer.subarray(0, closing + 5));
      const card = decoded === undefined ? undefined : parseCard(decoded, name);
      return card === undefined
        ? failure("SKILL_INVALID", "Skill 文件无效")
        : { ok: true, value: card };
    } catch (error) {
      return this.#isMissing(error)
        ? failure("SKILL_NOT_FOUND", "Skill 不存在")
        : failure("SKILL_IO_ERROR", "无法读取 Skill 文件");
    } finally {
      await handle?.close();
    }
  }

  async #safePath(name: string): Promise<SkillResult<string>> {
    const candidate = join(this.#skillsRoot, name, "SKILL.md");
    if (!within(this.#workspace, candidate)) {
      return failure("SKILL_OUTSIDE_WORKSPACE", "Skill 路径越出工作区");
    }
    try {
      const fileInfo = await lstat(candidate);
      if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
        return failure("SKILL_OUTSIDE_WORKSPACE", "Skill 路径越出工作区");
      }
      const actualRoot = await realpath(this.#workspace);
      const actual = await realpath(candidate);
      if (!within(actualRoot, actual)) {
        return failure("SKILL_OUTSIDE_WORKSPACE", "Skill 路径越出工作区");
      }
      return { ok: true, value: actual };
    } catch (error) {
      return this.#isMissing(error)
        ? failure("SKILL_NOT_FOUND", "Skill 不存在")
        : failure("SKILL_IO_ERROR", "无法读取 Skill 文件");
    }
  }

  #isMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
  }
}
