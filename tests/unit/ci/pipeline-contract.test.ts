import { readFileSync } from "node:fs";

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
});
