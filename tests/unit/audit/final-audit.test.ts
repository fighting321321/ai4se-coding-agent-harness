import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const auditScript = join(repositoryRoot, "scripts/final-audit.mjs");

function run(command: string, args: readonly string[], cwd: string) {
  return spawnSync(command, [...args], {
    cwd,
    encoding: "utf8",
    shell: false
  });
}

function runGit(root: string, args: readonly string[], input?: string | Buffer) {
  const result = spawnSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    input,
    shell: false
  });
  const diagnostic = [result.stdout, result.stderr, result.error?.message]
    .filter((value) => value !== undefined && value.length > 0)
    .join("\n");
  expect(result.status, diagnostic).toBe(0);
  return result.stdout.trim();
}

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "ai4se-final-audit-"));
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["config", "user.email", "audit-test@example.invalid"]);
  runGit(root, ["config", "user.name", "Audit Test"]);
  writeFileSync(join(root, "safe.txt"), "safe fixture\n", "utf8");
  runGit(root, ["add", "safe.txt"]);
  runGit(root, ["commit", "--quiet", "-m", "safe baseline"]);
  return root;
}

function runAudit(root: string, nodeArgs: readonly string[] = []) {
  return run(process.execPath, [...nodeArgs, auditScript, root], repositoryRoot);
}

function addMemoryStressHistory(root: string): void {
  const blobCount = 48;
  const blobSize = 1024 * 1024;
  const chunks: Buffer[] = [];
  for (let index = 0; index < blobCount; index += 1) {
    const content = Buffer.alloc(blobSize, 0x61);
    content.write(`memory-stress-${index.toString().padStart(3, "0")}`);
    chunks.push(
      Buffer.from(`blob\nmark :${index + 1}\ndata ${blobSize}\n`, "utf8"),
      content,
      Buffer.from("\n", "utf8")
    );
  }
  const message = "memory stress history";
  chunks.push(
    Buffer.from(
      [
        "commit refs/heads/memory-stress",
        "committer Audit Test <audit-test@example.invalid> 1700000000 +0000",
        `data ${Buffer.byteLength(message)}`,
        message,
        ...Array.from(
          { length: blobCount },
          (_, index) => `M 100644 :${index + 1} memory-${index.toString().padStart(3, "0")}.bin`
        ),
        "done",
        ""
      ].join("\n"),
      "utf8"
    )
  );
  runGit(root, ["fast-import", "--quiet"], Buffer.concat(chunks));
}

function createHeapBudgetGuard(root: string): string {
  const guardPath = join(root, "heap-budget-guard.mjs");
  writeFileSync(
    guardPath,
    [
      'import { Buffer } from "node:buffer";',
      "const originalSet = Map.prototype.set;",
      "const retainedBytesByMap = new WeakMap();",
      "Map.prototype.set = function guardedMapSet(key, value) {",
      "  if (Buffer.isBuffer(value)) {",
      "    const retainedBytes = (retainedBytesByMap.get(this) ?? 0) + value.length;",
      "    retainedBytesByMap.set(this, retainedBytes);",
      "    if (retainedBytes > 20 * 1024 * 1024) {",
      '      throw new Error("AUDIT_TEST_BUFFER_BUDGET");',
      "    }",
      "  }",
      "  const result = originalSet.call(this, key, value);",
      "  if (Array.isArray(value) && this.size > 96) {",
      '    throw new Error("AUDIT_TEST_MAP_ENTRY_BUDGET");',
      "  }",
      "  return result;",
      "};",
      ""
    ].join("\n"),
    "utf8"
  );
  return guardPath;
}

function addSmallBlobStressHistory(root: string): void {
  const blobCount = 192;
  const chunks: Buffer[] = [];
  for (let index = 0; index < blobCount; index += 1) {
    const content = `small-memory-stress-${index.toString().padStart(3, "0")}\n`;
    chunks.push(
      Buffer.from(`blob\nmark :${index + 1}\ndata ${Buffer.byteLength(content)}\n${content}`, "utf8")
    );
  }
  const message = "small memory stress history";
  chunks.push(
    Buffer.from(
      [
        "commit refs/heads/small-memory-stress",
        "committer Audit Test <audit-test@example.invalid> 1700000000 +0000",
        `data ${Buffer.byteLength(message)}`,
        message,
        ...Array.from(
          { length: blobCount },
          (_, index) => `M 100644 :${index + 1} small-${index.toString().padStart(3, "0")}.txt`
        ),
        "done",
        ""
      ].join("\n"),
      "utf8"
    )
  );
  runGit(root, ["fast-import", "--quiet"], Buffer.concat(chunks));
}

function openAiCanary(): string {
  return ["sk", "proj", "T12AuditCanaryOnlyForAutomatedTests123456789"].join("-");
}

function gitLabCanary(): string {
  return ["gl", "pat-", "T12AuditCanaryOnlyForTests123456789"].join("");
}

function awsCanary(): string {
  return ["A", "KIA", "T12AUDITCANARY12"].join("");
}

function pemCanary(): string {
  return ["-----BEGIN ", "PRIVATE KEY-----"].join("");
}

const historicalCanaries = [
  ["OPENAI_TOKEN", openAiCanary],
  ["GITLAB_PAT", gitLabCanary],
  ["AWS_ACCESS_KEY", awsCanary],
  ["PEM_PRIVATE_KEY", pemCanary]
] as const;

describe("最终交付审计", () => {
  it("安全的临时 Git 仓库退出 0 并如实报告 Pages artifact 不存在", () => {
    const root = createRepository();
    const result = runAudit(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("apps/web/dist");
    expect(result.stdout).toContain("不存在，未扫描");
  });

  it("发现当前受控文件中的高置信度 canary 且不回显正文", () => {
    const root = createRepository();
    const canary = openAiCanary();
    writeFileSync(join(root, "tracked-canary.txt"), `${canary}\n`, "utf8");
    runGit(root, ["add", "tracked-canary.txt"]);

    const result = runAudit(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("OPENAI_TOKEN");
    expect(result.stderr).toContain("tracked-canary.txt");
    expect(result.stderr).toContain("撤销凭据并人工清理历史");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(canary);
  });

  it("发现未忽略的 untracked 文件中的高置信度 canary", () => {
    const root = createRepository();
    const canary = openAiCanary();
    writeFileSync(join(root, "untracked-canary.txt"), `${canary}\n`, "utf8");

    const result = runAudit(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPENAI_TOKEN");
    expect(result.stderr).toContain("current:untracked-canary.txt");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(canary);
  });

  it("扫描未暂存 symlink 的 link text 且不跟随目标", ({ skip }) => {
    const root = createRepository();
    const canary = openAiCanary();
    try {
      symlinkSync(canary, join(root, "untracked-dangerous-link"), "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        const safeTarget = mkdtempSync(join(tmpdir(), `${canary}-`));
        writeFileSync(join(safeTarget, "safe.txt"), "safe target body\n", "utf8");
        try {
          symlinkSync(safeTarget, join(root, "untracked-dangerous-link"), "junction");
        } catch (junctionError) {
          if ((junctionError as NodeJS.ErrnoException).code === "EPERM") {
            skip();
            return;
          }
          throw junctionError;
        }
      } else {
        throw error;
      }
    }

    const result = runAudit(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPENAI_TOKEN");
    expect(result.stderr).toContain("current:untracked-dangerous-link");
    expect(result.stderr).not.toContain("AUDIT_ERROR");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(canary);
  });

  it("明显标为测试用途的低置信度占位符不会误报", () => {
    const root = createRepository();
    const placeholder = ["sk", "test", "only", "fixture", "not", "a", "credential"].join("-");
    writeFileSync(join(root, "placeholder.txt"), `${placeholder}\n`, "utf8");
    runGit(root, ["add", "placeholder.txt"]);

    const result = runAudit(root);

    expect(result.status, result.stderr).toBe(0);
  });

  it("秘密已 stage 后即使工作树覆盖为安全内容仍扫描 index blob", () => {
    const root = createRepository();
    const canary = openAiCanary();
    const path = "staged-canary.txt";
    writeFileSync(join(root, path), `${canary}\n`, "utf8");
    runGit(root, ["add", path]);
    writeFileSync(join(root, path), "safe working tree content\n", "utf8");

    const result = runAudit(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("OPENAI_TOKEN");
    expect(result.stderr).toContain(`index:${path}`);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(canary);
  });

  it("诊断会脱敏路径中的秘密并将控制字符确定性转义为单行", () => {
    const root = createRepository();
    const canary = openAiCanary();
    const oid = runGit(root, ["hash-object", "-w", "--stdin"], `${canary}\n`);
    const hostilePath = `unsafe\n\u001b[31m-${canary}.txt`;
    const treeOid = runGit(
      root,
      ["mktree", "-z"],
      Buffer.from(`100644 blob ${oid}\t${hostilePath}\0`, "utf8")
    );
    const commitOid = runGit(root, ["commit-tree", treeOid], "hostile diagnostic fixture\n");
    runGit(root, ["update-ref", "refs/heads/hostile-diagnostic", commitOid]);

    const result = runAudit(root);
    const findingLines = result.stderr.trimEnd().split(/\r?\n/u);

    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain(canary);
    expect(result.stderr).not.toContain("\u001b");
    expect(findingLines).toHaveLength(1);
    expect(findingLines[0]).toContain("[REDACTED]");
    expect(findingLines[0]).toContain("\\n");
    expect(findingLines[0]).toContain("\\x1b");
  });

  it("单个审计对象超过 8 MiB 时稳定 AUDIT_ERROR 而不静默漏扫", () => {
    const root = createRepository();
    const path = "oversized.bin";
    writeFileSync(join(root, path), Buffer.alloc(8 * 1024 * 1024 + 1, 0x61));
    runGit(root, ["add", path]);

    const result = runAudit(root);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "AUDIT_ERROR | BLOB_SIZE_LIMIT | current:oversized.bin | 单个审计对象超过大小上限（8388608 bytes）\n"
    );
  });

  it("大量唯一历史 blob 在受限 Node heap 下仍以有界批次完成", () => {
    const root = createRepository();
    addMemoryStressHistory(root);
    const guardPath = createHeapBudgetGuard(root);

    const result = runAudit(root, [
      "--max-old-space-size=16",
      `--import=${pathToFileURL(guardPath).href}`
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).not.toContain("AUDIT_TEST_BUFFER_BUDGET");
    expect(result.stderr).not.toContain("AUDIT_TEST_MAP_ENTRY_BUDGET");
    expect(result.stdout).toContain("最终审计通过");
  }, 20_000);

  it("大量小型唯一历史 blob 不会使分类缓存条目无界增长", () => {
    const root = createRepository();
    addSmallBlobStressHistory(root);
    const guardPath = createHeapBudgetGuard(root);

    const result = runAudit(root, [`--import=${pathToFileURL(guardPath).href}`]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).not.toContain("AUDIT_TEST_MAP_ENTRY_BUDGET");
    expect(result.stdout).toContain("最终审计通过");
  });

  it("命中数量超过固定上限时 fail-closed 且不回显秘密", () => {
    const root = createRepository();
    const canary = openAiCanary();
    for (let index = 0; index <= 256; index += 1) {
      writeFileSync(
        join(root, `finding-${index.toString().padStart(3, "0")}.txt`),
        `${canary}\n`,
        "utf8"
      );
    }

    const result = runAudit(root);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "AUDIT_ERROR | FINDING_LIMIT | 审计命中数量超过上限（256）\n"
    );
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(canary);
  });

  it("index 跳过 gitlink 但仍扫描 120000 symlink blob", () => {
    const root = createRepository();
    const gitlinkOid = runGit(root, ["rev-parse", "HEAD"]);
    runGit(root, [
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${gitlinkOid},vendor/submodule`
    ]);
    const canary = openAiCanary();
    const symlinkOid = runGit(root, ["hash-object", "-w", "--stdin"], canary);
    runGit(root, [
      "update-index",
      "--add",
      "--cacheinfo",
      `120000,${symlinkOid},dangerous-link`
    ]);

    const result = runAudit(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPENAI_TOKEN");
    expect(result.stderr).toContain("index:dangerous-link");
    expect(result.stderr).not.toContain("AUDIT_ERROR");
    expect(result.stderr).not.toContain(canary);
  });

  it.each(historicalCanaries)("含 NUL 的 %s canary 提交后删除仍由历史扫描发现", (category, createCanary) => {
    const root = createRepository();
    const canary = createCanary();
    const path = `historic-${category.toLowerCase()}.bin`;
    writeFileSync(join(root, path), Buffer.concat([
      Buffer.from("binary-test\0", "utf8"),
      Buffer.from(canary, "utf8"),
      Buffer.from("\0fixture", "utf8")
    ]));
    runGit(root, ["add", path]);
    runGit(root, ["commit", "--quiet", "-m", "add test canary"]);
    const containingCommit = runGit(root, ["rev-parse", "HEAD"]);
    runGit(root, ["rm", "--quiet", path]);
    runGit(root, ["commit", "--quiet", "-m", "remove test canary"]);

    const result = runAudit(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(category);
    expect(result.stderr).toContain(path);
    expect(result.stderr).toContain(containingCommit);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(canary);
  });

  it("历史同一类别与路径只保留首次扫描到的提交诊断", () => {
    const root = createRepository();
    const canary = openAiCanary();
    const path = "repeated-history-canary.txt";
    writeFileSync(join(root, path), `older ${canary}\n`, "utf8");
    runGit(root, ["add", path]);
    runGit(root, ["commit", "--quiet", "-m", "older canary"]);
    const olderCommit = runGit(root, ["rev-parse", "HEAD"]);
    writeFileSync(join(root, path), `newer ${canary}\n`, "utf8");
    runGit(root, ["add", path]);
    runGit(root, ["commit", "--quiet", "-m", "newer canary"]);
    const newerCommit = runGit(root, ["rev-parse", "HEAD"]);

    const result = runAudit(root);
    const historyFindings = result.stderr
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("OPENAI_TOKEN | history:"));

    expect(historyFindings).toHaveLength(1);
    expect(historyFindings[0]).toContain(newerCommit);
    expect(historyFindings[0]).not.toContain(olderCommit);
  });

  it("安全静态 Pages artifact 通过", () => {
    const root = createRepository();
    const dist = join(root, "apps", "web", "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "<main>AI4SE</main>\n", "utf8");
    writeFileSync(join(dist, "assets", "app.js"), "console.log('static');\n", "utf8");

    const result = runAudit(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Pages artifact: apps/web/dist 已扫描");
  });

  it.each([
    ["ARTIFACT_INTERNAL_STATE", [".ai4se", "state.json"], "internal fixture body"],
    ["ARTIFACT_CREDENTIAL_FILE", ["credentials.json"], "{}"],
    ["ARTIFACT_API_SERVICE", ["api", "server-entry.js"], "backend fixture body"],
    ["ARTIFACT_ENV_FILE", [".env.production"], "environment fixture body"],
    ["ARTIFACT_CREDENTIAL_FILE", ["credentials.yaml"], "credential fixture body"],
    ["ARTIFACT_BACKEND_FILE", ["backend", "worker.js"], "backend fixture body"],
    ["ARTIFACT_BACKEND_FILE", ["functions", "handler.js"], "function fixture body"],
    ["ARTIFACT_BACKEND_FILE", ["server", "main.js"], "server fixture body"],
    ["ARTIFACT_UNEXPECTED_FILE", ["notes.txt"], "unexpected fixture body"],
    [
      "PEM_PRIVATE_KEY",
      ["assets", "private.txt"],
      ["-----BEGIN ", "PRIVATE KEY-----", "test-only"].join("")
    ],
    [
      "GITLAB_PAT",
      ["assets", "token.txt"],
      gitLabCanary()
    ],
    [
      "AWS_ACCESS_KEY",
      ["assets", "aws.txt"],
      awsCanary()
    ]
  ])("Pages artifact 命中 %s 时失败且不回显正文", (category, path, content) => {
    const root = createRepository();
    const dist = join(root, "apps", "web", "dist");
    const target = join(dist, ...path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, `${content}\n`, "utf8");

    const result = runAudit(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(category);
    expect(result.stderr).toContain(path.join("/"));
    expect(result.stderr).toContain("撤销凭据并人工清理历史");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(content);
  });
});
