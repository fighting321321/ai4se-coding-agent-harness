import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SkillRegistry } from "../../../packages/harness/src/index.js";

async function workspace(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "ai4se-skills-"));
}

async function writeSkill(root: string, folder: string, source: string): Promise<void> {
  const directory = join(root, ".ai4se", "skills", folder);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "SKILL.md"), source, "utf8");
}

describe("SkillRegistry", () => {
  it("发现时只返回稳定排序名片，明确加载后才读取完整正文且会话内去重", async () => {
    const root = await workspace();
    await writeSkill(root, "zeta", "---\nname: zeta\ndescription: Z skill\n---\nSECRET BODY Z");
    await writeSkill(root, "alpha", "---\nname: alpha\ndescription: A skill\n---\nFULL ALPHA INSTRUCTIONS");
    const registry = new SkillRegistry(root);

    const discovered = await registry.discover();

    expect(discovered).toEqual({ ok: true, value: [
      { name: "alpha", description: "A skill" },
      { name: "zeta", description: "Z skill" }
    ] });
    expect(JSON.stringify(discovered)).not.toContain("FULL ALPHA INSTRUCTIONS");
    const first = await registry.load("alpha");
    const second = await registry.load("alpha");
    expect(first).toEqual({ ok: true, value: expect.stringContaining("FULL ALPHA INSTRUCTIONS") });
    expect(second).toEqual({ ok: true, value: "" });
    expect(registry.loadedInstructions()).toEqual([
      expect.stringContaining("FULL ALPHA INSTRUCTIONS")
    ]);
  });

  it("拒绝路径逃逸、无效元数据、超大文件和符号链接越界", async () => {
    const root = await workspace();
    await writeSkill(root, "broken", "not frontmatter");
    await writeSkill(root, "large", `---\nname: large\ndescription: too large\n---\n${"x".repeat(70_000)}`);
    const outside = join(await workspace(), "outside.md");
    await writeFile(outside, "---\nname: linked\ndescription: outside\n---\noutside", "utf8");
    const corruptDirectory = join(root, ".ai4se", "skills", "corrupt");
    await mkdir(corruptDirectory, { recursive: true });
    await writeFile(join(corruptDirectory, "SKILL.md"), Buffer.from([0xff, 0xfe, 0xfd]));
    const linkedDirectory = join(root, ".ai4se", "skills", "linked");
    await mkdir(linkedDirectory, { recursive: true });
    try {
      await symlink(outside, join(linkedDirectory, "SKILL.md"), "file");
    } catch {
      // Windows 无符号链接权限时仍覆盖其余安全边界。
    }
    const registry = new SkillRegistry(root);

    const discovered = await registry.discover();

    expect(discovered.ok).toBe(true);
    if (discovered.ok) {
      expect(discovered.value).toEqual([]);
    }
    await expect(registry.load("../broken")).resolves.toEqual({
      ok: false,
      error: { code: "SKILL_NAME_INVALID", message: "Skill 名称无效" }
    });
    await expect(registry.load("broken")).resolves.toEqual({
      ok: false,
      error: { code: "SKILL_INVALID", message: "Skill 文件无效" }
    });
    await expect(registry.load("large")).resolves.toEqual({
      ok: false,
      error: { code: "SKILL_TOO_LARGE", message: "Skill 文件超过大小限制" }
    });
    await expect(registry.load("corrupt")).resolves.toEqual({
      ok: false,
      error: { code: "SKILL_INVALID", message: "Skill 文件无效" }
    });
  });
});
