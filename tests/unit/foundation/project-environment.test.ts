import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("项目统一环境入口", () => {
  const launcherPath = "scripts/project-env.ps1";
  const instructionsPath = "AGENTS.md";

  it("固定 Node 24.14.0、pnpm 11.14.0 与全部验证任务", () => {
    expect(existsSync(launcherPath)).toBe(true);

    const launcher = readFileSync(launcherPath, "utf8");
    expect(launcher).toContain('"24.14.0"');
    expect(launcher).toContain('"11.14.0"');
    expect(launcher).toContain("AI4SE_NODE");
    expect(launcher).toContain("AI4SE_PNPM_CLI");
    expect(launcher).toContain("npm_execpath");
    for (const task of ["test", "lint", "typecheck", "build", "demo", "audit", "all"]) {
      expect(launcher).toContain(`"${task}"`);
    }
    expect(launcher).not.toContain("D:\\nodejs");

    expect(existsSync(instructionsPath)).toBe(true);
    const instructions = readFileSync(instructionsPath, "utf8");
    expect(instructions).toContain(".\\scripts\\project-env.ps1 <task>");
    expect(instructions).toContain("Node 24.14.0");
    expect(instructions).toContain("pnpm 11.14.0");
    expect(instructions).toContain("`v2.0.3`");
    expect(instructions).toContain("实际运行平台");
  });
});
