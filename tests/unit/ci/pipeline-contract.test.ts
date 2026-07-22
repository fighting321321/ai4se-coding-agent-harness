import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("GitLab pipeline", () => {
  it("使用 Node 24 运行全部根门禁且不依赖 Docker-in-Docker", () => {
    const yaml = readFileSync(".gitlab-ci.yml", "utf8");
    const unitTest = yaml.match(
      /^unit-test:\r?\n(?<body>[\s\S]*?)(?=^[^ \r\n][^:\r\n]*:\r?$|(?![\s\S]))/mu
    )
      ?.groups?.body;

    expect(unitTest).toBeDefined();
    expect(unitTest).toContain("node:24.14.0-bookworm-slim");
    expect(unitTest).toMatch(/variables:\r?\n {4}CI: "true"\r?\n {4}GIT_DEPTH: "0"/u);
    const gitSetupCommands = [
      "apt-get update",
      "apt-get install -y --no-install-recommends git",
      "git --version"
    ];
    for (const command of gitSetupCommands) {
      expect(unitTest).toContain(`- ${command}`);
    }
    const gitSetupOffsets = gitSetupCommands.map((command) => unitTest!.indexOf(command));
    expect(gitSetupOffsets).toEqual(
      [...gitSetupOffsets].sort((left, right) => left - right)
    );
    expect(gitSetupOffsets.at(-1)).toBeLessThan(unitTest!.indexOf("corepack enable"));
    const commands = [
      "pnpm install --frozen-lockfile",
      "pnpm --filter @ai4se/harness build",
      "pnpm test",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm build",
      "pnpm demo",
      "pnpm --filter @ai4se/harness pack",
      "pnpm final:audit"
    ];
    for (const command of commands) {
      expect(unitTest).toContain(command);
    }
    expect(unitTest).toContain("mkdir -p .ai4se/harness-pack");
    expect(unitTest).toContain(
      "pnpm --filter @ai4se/harness pack --pack-destination .ai4se/harness-pack"
    );
    expect(unitTest).not.toContain("../harness-pack");
    expect(unitTest).not.toContain("rm -rf");
    expect(unitTest).toContain('name: "ai4se-harness-$CI_COMMIT_REF_SLUG"');
    expect(unitTest).toMatch(/artifacts:\r?\n {4}name:[\s\S]*?paths:\r?\n {6}- \.ai4se\/harness-pack\/\*\.tgz/u);
    expect(unitTest).toContain("expire_in: 1 year");
    const commandOffsets = commands.map((command) => unitTest!.indexOf(command));
    expect(commandOffsets).toEqual([...commandOffsets].sort((left, right) => left - right));
    expect(yaml).not.toContain("docker:dind");
  });

  it("仅保留可下载的 CLI 交付产物，不声明不可用的 Pages 部署", () => {
    const ci = readFileSync(".gitlab-ci.yml", "utf8");

    expect(ci).toMatch(/^unit-test:/mu);
    expect(ci).not.toMatch(/^pages:/mu);
    expect(ci).not.toContain("$CI_PAGES_URL");
    expect(ci).toContain("pnpm --filter @ai4se/harness pack");
    expect(ci).toContain(".ai4se/harness-pack/*.tgz");
    expect(ci).toContain("expire_in: 1 year");
  });

  it("本地启动器仅通过回环地址编排 API 与 Web", () => {
    const launcherPath = "scripts/local-web.mjs";
    const runnerPath = "scripts/local-web-runner.mjs";

    expect(existsSync(launcherPath)).toBe(true);
    expect(existsSync(runnerPath)).toBe(true);
    const launcher = [
      readFileSync(launcherPath, "utf8"),
      readFileSync(runnerPath, "utf8")
    ].join("\n");

    expect(launcher).toContain("127.0.0.1");
  });
});
