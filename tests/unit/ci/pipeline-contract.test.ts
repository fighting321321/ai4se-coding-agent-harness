import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("GitLab pipeline", () => {
  it("使用 Node 24 运行全部根门禁且不依赖 Docker-in-Docker", () => {
    const yaml = readFileSync(".gitlab-ci.yml", "utf8");

    expect(yaml).toContain("unit-test:");
    expect(yaml).toContain("node:24.14.0-bookworm-slim");
    expect(yaml).toContain("pnpm install --frozen-lockfile");
    expect(yaml).toContain("pnpm test");
    expect(yaml).toContain("pnpm lint");
    expect(yaml).toContain("pnpm typecheck");
    expect(yaml).toContain("pnpm build");
    expect(yaml).not.toContain("docker:dind");
  });

  it("发布静态 Web 到默认分支的 Pages，且不携带凭据或 API 产物", () => {
    const ci = readFileSync(".gitlab-ci.yml", "utf8");
    const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string | undefined>;
    };

    expect(ci).toMatch(/^unit-test:/mu);
    expect(ci).toMatch(/^pages:/mu);
    expect(ci).toContain("- pnpm --filter @ai4se/web build");
    expect(ci).toContain("- cp -R apps/web/dist/. public/");
    expect(ci).toContain("paths:\n      - public");
    expect(ci).not.toMatch(/API_KEY|OPENAI_API_KEY|credentials\.json/iu);
    expect(ci).toContain('needs: ["unit-test"]');
    expect(ci).toContain("$CI_DEFAULT_BRANCH");
    expect(ci).not.toMatch(/\.ai4se/iu);
    expect(rootPackage.scripts["web:local"]).toBeDefined();
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
