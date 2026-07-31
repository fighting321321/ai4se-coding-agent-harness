import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const pnpmCli = process.env.npm_execpath;

function runNode(args: readonly string[], cwd: string) {
  const inheritedPath = process.env.PATH ?? process.env.Path ?? "";
  return spawnSync(process.execPath, [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      PATH: `${dirname(process.execPath)}${delimiter}${inheritedPath}`
    },
    shell: false
  });
}

function runPnpm(args: readonly string[], cwd: string) {
  if (pnpmCli === undefined || pnpmCli.length === 0) {
    throw new Error("测试环境未提供 pnpm 启动路径");
  }
  return runNode([pnpmCli, ...args], cwd);
}

function expectSuccess(result: ReturnType<typeof spawnSync>): void {
  const diagnostic = [result.stdout, result.stderr, result.error?.message]
    .filter((value) => value !== undefined && value.length > 0)
    .join("\n");
  expect(result.status, diagnostic).toBe(0);
  expect(result.signal, diagnostic).toBeNull();
  expect(result.error, diagnostic).toBeUndefined();
}

describe("@ai4se/harness 分发包", () => {
  it("声明可安装的 ESM、类型和 CLI 入口", async () => {
    const source = await readFile(join(repositoryRoot, "packages/harness/package.json"), "utf8");
    const manifest = JSON.parse(source) as Record<string, unknown>;

    expect(manifest).toMatchObject({
      name: "@ai4se/harness",
      version: "2.0.0",
      type: "module",
      engines: { node: ">=24.0.0 <25.0.0" },
      files: ["dist", "bin", "README.md"],
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js"
        }
      },
      bin: { "ai4se-harness": "./bin/ai4se-harness.mjs" }
    });
    expect(manifest.private).not.toBe(true);
    await expect(
      access(join(repositoryRoot, "packages/harness/bin/ai4se-harness.mjs"))
    ).resolves.toBeUndefined();
  });

  it("从 tarball 在全新目录离线安装、导入并运行命令", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ai4se-package-smoke-"));
    const tarballs = join(workspace, "tarballs");
    const installation = join(workspace, "installation");
    await mkdir(tarballs);
    await mkdir(installation);

    const build = runPnpm(["--filter", "@ai4se/harness", "build"], repositoryRoot);
    expectSuccess(build);
    const pack = runPnpm([
      "--filter",
      "@ai4se/harness",
      "pack",
      "--pack-destination",
      tarballs
    ], repositoryRoot);
    expectSuccess(pack);

    const archives = (await readdir(tarballs)).filter((name) => name.endsWith(".tgz"));
    expect(archives).toHaveLength(1);
    const archive = join(tarballs, archives[0]!);

    await writeFile(
      join(installation, "package.json"),
      `${JSON.stringify({ name: "distribution-smoke", private: true, type: "module" })}\n`,
      "utf8"
    );
    const install = runPnpm(["add", "--offline", archive], installation);
    expectSuccess(install);

    await writeFile(
      join(installation, "verify-import.mjs"),
      [
        'import { runCli, runInteractiveSession, runOfflineSmoke } from "@ai4se/harness";',
        'if (typeof runCli !== "function" || typeof runInteractiveSession !== "function") process.exit(2);',
        "console.log(await runOfflineSmoke());",
        ""
      ].join("\n"),
      "utf8"
    );
    const imported = runNode(["verify-import.mjs"], installation);
    expectSuccess(imported);
    expect(imported.stdout).toBe("AI4SE Harness 离线 smoke：completed\n");

    const cli = runPnpm(["exec", "ai4se-harness"], installation);
    expect(cli.status).toBe(1);
    expect(cli.stdout).not.toContain("离线 smoke");
    expect(cli.stderr).toContain("交互会话需要 TTY");

    const explicitSmoke = runPnpm(["exec", "ai4se-harness", "smoke"], installation);
    expectSuccess(explicitSmoke);
    expect(explicitSmoke.stdout).toBe("AI4SE Harness 离线 smoke：completed\n");

    const help = runPnpm(["exec", "ai4se-harness", "--help"], installation);
    expectSuccess(help);
    expect(help.stdout).toContain("  ai4se-harness\n");
    expect(help.stdout).toContain("ai4se-harness start");

    const installedManifest = JSON.parse(
      await readFile(join(installation, "node_modules/@ai4se/harness/package.json"), "utf8")
    ) as { files?: unknown; private?: unknown };
    expect(installedManifest.private).not.toBe(true);
    expect(installedManifest.files).toEqual(["dist", "bin", "README.md"]);
    const installedFiles = (await readdir(
      join(installation, "node_modules/@ai4se/harness"),
      { recursive: true }
    )).map((path) => path.replaceAll("\\", "/"));
    expect(installedFiles).toContain("bin/ai4se-harness.mjs");
    expect(installedFiles).toContain("dist/index.js");
    expect(installedFiles).toContain("package.json");
    expect(installedFiles).toContain("README.md");
    expect(installedFiles).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/(?:^|\/)src(?:\/|$)/u),
      expect.stringMatching(/(?:^|\/)\.ai4se(?:\/|$)/u),
      expect.stringMatching(/(?:^|\/)(?:trace|memory|credentials)(?:\.|\/|$)/iu),
      expect.stringMatching(/\.ts$/u)
    ]));
  }, 20_000);
});
