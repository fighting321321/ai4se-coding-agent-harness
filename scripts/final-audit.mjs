import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync } from "node:fs";
import process from "node:process";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const SECRET_RULES = [
  {
    category: "OPENAI_TOKEN",
    pattern: /\bsk-(?:(?:proj|svcacct)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{48,})\b/u
  },
  { category: "GITLAB_PAT", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/u },
  { category: "AWS_ACCESS_KEY", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u },
  {
    category: "PEM_PRIVATE_KEY",
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/u
  }
];

const REMEDIATION = "撤销凭据并人工清理历史";
const MAX_AUDIT_OBJECT_BYTES = 8 * 1024 * 1024;
const OBJECT_COUNT_BATCH_SIZE = 64;
const CAT_FILE_BATCH_BYTES = 16 * 1024 * 1024;
const OID_CATEGORY_CACHE_SIZE = 64;
const MAX_FINDINGS = 256;
const CONTROL_CHARACTER_PATTERN = new RegExp(
  String.raw`[\u0000-\u001f\u007f-\u009f]`,
  "gu"
);
const root = resolve(process.argv[2] ?? process.cwd());
const findings = new Map();

function normalizePath(path) {
  return path.split(sep).join("/");
}

function repositoryPath(path) {
  const normalized = normalizePath(relative(root, path));
  return normalized.length === 0 ? "." : normalized;
}

function addFinding(category, location, key = `${category}\0${location}`) {
  if (findings.has(key)) {
    return;
  }
  if (findings.size >= MAX_FINDINGS) {
    throw new Error(`FINDING_LIMIT | 审计命中数量超过上限（${MAX_FINDINGS}）`);
  }
  findings.set(key, { category, location });
}

class FixedCapacityLru {
  #entries = new Map();

  get(key) {
    const value = this.#entries.get(key);
    if (value !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, value);
    }
    return value;
  }

  has(key) {
    return this.#entries.has(key);
  }

  set(key, value) {
    if (this.#entries.has(key)) {
      this.#entries.delete(key);
    } else if (this.#entries.size >= OID_CATEGORY_CACHE_SIZE) {
      const oldestKey = this.#entries.keys().next().value;
      this.#entries.delete(oldestKey);
    }
    this.#entries.set(key, value);
  }
}

function sanitizeDiagnostic(value) {
  let sanitized = value;
  for (const { pattern } of SECRET_RULES) {
    sanitized = sanitized.replace(new RegExp(pattern.source, `${pattern.flags}g`), "[REDACTED]");
  }
  return sanitized.replace(CONTROL_CHARACTER_PATTERN, (character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0) return "\\0";
    if (code === 9) return "\\t";
    if (code === 10) return "\\n";
    if (code === 13) return "\\r";
    if (code <= 0xff) return `\\x${code.toString(16).padStart(2, "0")}`;
    return `\\u${code.toString(16).padStart(4, "0")}`;
  });
}

function assertAuditObjectSize(size, location) {
  if (size > MAX_AUDIT_OBJECT_BYTES) {
    throw new Error(
      `BLOB_SIZE_LIMIT | ${location} | 单个审计对象超过大小上限（${MAX_AUDIT_OBJECT_BYTES} bytes）`
    );
  }
}

function readAuditFile(path, location) {
  assertAuditObjectSize(lstatSync(path).size, location);
  return readFileSync(path);
}

function readAuditLink(path, location) {
  const content = Buffer.from(readlinkSync(path), "utf8");
  assertAuditObjectSize(content.length, location);
  return content;
}

function runGit(args, acceptedStatuses = [0], input = undefined) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    input,
    shell: false,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error !== undefined) {
    throw new Error(`Git 执行失败：${result.error.code ?? "UNKNOWN"}`);
  }
  if (!acceptedStatuses.includes(result.status ?? -1)) {
    throw new Error(`Git 执行失败：退出码 ${result.status ?? "unknown"}`);
  }
  return result;
}

function runGitBinary(args, input, maxBuffer = 32 * 1024 * 1024) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: null,
    input,
    shell: false,
    maxBuffer
  });
  if (result.error !== undefined) {
    throw new Error(`Git 执行失败：${result.error.code ?? "UNKNOWN"}`);
  }
  if (result.status !== 0) {
    throw new Error(`Git 执行失败：退出码 ${result.status ?? "unknown"}`);
  }
  return result.stdout;
}

function findCategories(content) {
  const text = Buffer.isBuffer(content) ? content.toString("utf8") : content;
  return SECRET_RULES.filter(({ pattern }) => pattern.test(text)).map(({ category }) => category);
}

function scanContent(content, location) {
  for (const category of findCategories(content)) {
    addFinding(category, location);
  }
}

function scanCurrentPath(listedPath) {
  const path = listedPath.endsWith("/") ? listedPath.slice(0, -1) : listedPath;
  const absolutePath = join(root, path);
  const location = `current:${normalizePath(path)}`;
  let stats;
  try {
    stats = lstatSync(absolutePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (stats.isSymbolicLink()) {
    scanContent(readAuditLink(absolutePath, location), location);
  } else if (stats.isFile()) {
    scanContent(readAuditFile(absolutePath, location), location);
  }
}

function scanCurrentFiles() {
  const argumentLists = [
    ["ls-files", "--cached", "--others", "--exclude-standard", "--directory", "-z"],
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]
  ];
  for (const args of argumentLists) {
    const listed = runGitBinary(args);
    for (const path of listed.toString("utf8").split("\0")) {
      if (path.length > 0) {
        scanCurrentPath(path);
      }
    }
  }
}

function scanIndex() {
  const listed = runGitBinary(["ls-files", "-s", "-z"]);
  const entries = [];
  for (const record of listed.toString("utf8").split("\0")) {
    if (record.length === 0) {
      continue;
    }
    const matched = /^(?<mode>[0-7]+) (?<oid>[0-9a-f]+) (?<stage>[0-3])\t(?<path>[\s\S]+)$/u.exec(record);
    if (matched?.groups !== undefined && matched.groups.mode !== "160000") {
      entries.push({
        mode: matched.groups.mode,
        oid: matched.groups.oid,
        path: matched.groups.path
      });
    }
  }
  const categoriesByOid = new FixedCapacityLru();
  for (let offset = 0; offset < entries.length; offset += OBJECT_COUNT_BATCH_SIZE) {
    const batch = entries.slice(offset, offset + OBJECT_COUNT_BATCH_SIZE);
    classifyBlobObjects(
      batch.map(({ oid, path }) => ({ oid, location: `index:${normalizePath(path)}` })),
      categoriesByOid
    );
    for (const { oid, path } of batch) {
      for (const category of categoriesByOid.get(oid) ?? []) {
        addFinding(category, `index:${normalizePath(path)}`);
      }
    }
  }
}

function parseTreeEntries(buffer) {
  const entries = [];
  for (const record of buffer.toString("utf8").split("\0")) {
    if (record.length === 0) {
      continue;
    }
    const matched = /^(?<mode>[0-7]+) (?<type>[^ ]+) (?<oid>[0-9a-f]+)\t(?<path>[\s\S]+)$/u.exec(record);
    if (matched?.groups?.type === "blob") {
      entries.push({ oid: matched.groups.oid, path: matched.groups.path });
    }
  }
  return entries;
}

function readBlobSizes(oids) {
  const sizes = new Map();
  for (let offset = 0; offset < oids.length; offset += OBJECT_COUNT_BATCH_SIZE) {
    const batch = oids.slice(offset, offset + OBJECT_COUNT_BATCH_SIZE);
    const input = `${batch.join("\n")}\n`;
    const output = runGit([
      "cat-file",
      "--batch-check=%(objectname) %(objecttype) %(objectsize)"
    ], [0], input).stdout;
    for (const line of output.split(/\r?\n/u).filter(Boolean)) {
      const [oid, type, sizeText] = line.split(" ");
      if (oid !== undefined && type === "blob" && sizeText !== undefined) {
        sizes.set(oid, Number.parseInt(sizeText, 10));
      }
    }
  }
  return sizes;
}

function classifyBatchOutput(buffer, expectedOids, categoriesByOid) {
  let offset = 0;
  for (const expectedOid of expectedOids) {
    const headerEnd = buffer.indexOf(10, offset);
    if (headerEnd < 0) {
      throw new Error("Git blob 批量输出格式无效");
    }
    const header = buffer.subarray(offset, headerEnd).toString("utf8");
    const [oid, type, sizeText] = header.split(" ");
    const size = Number.parseInt(sizeText ?? "", 10);
    if (oid !== expectedOid || type !== "blob" || !Number.isSafeInteger(size) || size < 0) {
      throw new Error("Git blob 批量输出格式无效");
    }
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= buffer.length || buffer[contentEnd] !== 10) {
      throw new Error("Git blob 批量输出长度无效");
    }
    categoriesByOid.set(oid, findCategories(buffer.subarray(contentStart, contentEnd)));
    offset = contentEnd + 1;
  }
}

function classifyBlobObjects(objects, categoriesByOid) {
  const locations = new Map();
  for (const { oid, location } of objects) {
    if (!categoriesByOid.has(oid) && !locations.has(oid)) {
      locations.set(oid, location);
    }
  }
  const uniqueOids = [...locations.keys()];
  const sizes = readBlobSizes(uniqueOids);
  let batch = [];
  let batchBytes = 0;

  function flush() {
    if (batch.length === 0) {
      return;
    }
    const input = Buffer.from(`${batch.join("\n")}\n`, "utf8");
    const maxBuffer = Math.max(32 * 1024 * 1024, batchBytes + 1024 * batch.length);
    const output = runGitBinary(["cat-file", "--batch"], input, maxBuffer);
    classifyBatchOutput(output, batch, categoriesByOid);
    batch = [];
    batchBytes = 0;
  }

  for (const oid of uniqueOids) {
    const size = sizes.get(oid);
    if (size === undefined) {
      throw new Error("Git blob 大小查询缺失");
    }
    assertAuditObjectSize(size, locations.get(oid) ?? `git-object:${oid}`);
    if (batch.length > 0 && batchBytes + size > CAT_FILE_BATCH_BYTES) {
      flush();
    }
    batch.push(oid);
    batchBytes += size;
  }
  flush();
}

function scanHistory() {
  const commits = runGit(["rev-list", "--all"]).stdout.split(/\r?\n/u).filter(Boolean);
  const categoriesByOid = new FixedCapacityLru();
  for (const commit of commits) {
    const tree = runGitBinary(["ls-tree", "-r", "-z", "--full-tree", commit]);
    const entries = parseTreeEntries(tree);
    for (let offset = 0; offset < entries.length; offset += OBJECT_COUNT_BATCH_SIZE) {
      const batch = entries.slice(offset, offset + OBJECT_COUNT_BATCH_SIZE);
      classifyBlobObjects(
        batch.map(({ oid, path }) => ({
          oid,
          location: `history:${commit}:${normalizePath(path)}`
        })),
        categoriesByOid
      );
      for (const { oid, path } of batch) {
        for (const category of categoriesByOid.get(oid) ?? []) {
          const reportKey = `${category}\0${path}`;
          addFinding(category, `history:${commit}:${normalizePath(path)}`, reportKey);
        }
      }
    }
  }
}

function artifactPathCategory(path) {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").map((segment) => segment.toLowerCase());
  const basename = segments.at(-1) ?? "";
  if (segments.includes(".ai4se")) {
    return "ARTIFACT_INTERNAL_STATE";
  }
  if (basename === ".env" || basename.startsWith(".env.")) {
    return "ARTIFACT_ENV_FILE";
  }
  if (/^credentials(?:\..+)?$/u.test(basename)) {
    return "ARTIFACT_CREDENTIAL_FILE";
  }
  if (
    segments.includes("api") ||
    ["server-entry.js", "local-web-server.js", "cli-entry.js"].includes(basename)
  ) {
    return "ARTIFACT_API_SERVICE";
  }
  if (segments.some((segment) => ["backend", "functions", "server"].includes(segment))) {
    return "ARTIFACT_BACKEND_FILE";
  }
  return undefined;
}

function isAllowedArtifactFile(path) {
  const normalized = normalizePath(path);
  if (normalized === "index.html") {
    return true;
  }
  return /^assets\/[^/]+\.(?:avif|css|gif|ico|jpe?g|js|map|otf|png|svg|ttf|webp|woff2?)$/iu.test(
    normalized
  );
}

function walkArtifact(directory, artifactRoot) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    const path = repositoryPath(absolutePath);
    const artifactRelativePath = normalizePath(relative(artifactRoot, absolutePath));
    const pathCategory = artifactPathCategory(artifactRelativePath);
    if (pathCategory !== undefined) {
      addFinding(pathCategory, `artifact:${path}`);
    }
    if (entry.isSymbolicLink()) {
      addFinding("ARTIFACT_SYMLINK", `artifact:${path}`);
    } else if (entry.isDirectory()) {
      walkArtifact(absolutePath, artifactRoot);
    } else if (entry.isFile()) {
      if (pathCategory === undefined && !isAllowedArtifactFile(artifactRelativePath)) {
        addFinding("ARTIFACT_UNEXPECTED_FILE", `artifact:${path}`);
      }
      scanContent(readAuditFile(absolutePath, `artifact:${path}`), `artifact:${path}`);
    }
  }
}

function scanStaticWebArtifact() {
  const artifactRoot = join(root, "apps", "web", "dist");
  if (!existsSync(artifactRoot)) {
    process.stdout.write("静态 Web artifact: apps/web/dist 不存在，未扫描\n");
    return;
  }
  walkArtifact(artifactRoot, artifactRoot);
  process.stdout.write("静态 Web artifact: apps/web/dist 已扫描\n");
}

try {
  if (!isAbsolute(root)) {
    throw new Error("审计根目录必须是绝对路径");
  }
  runGit(["rev-parse", "--is-inside-work-tree"]);
  scanCurrentFiles();
  scanIndex();
  scanHistory();
  scanStaticWebArtifact();
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  process.stderr.write(`AUDIT_ERROR | ${sanitizeDiagnostic(message)}\n`);
  process.exitCode = 2;
}

if (process.exitCode !== 2 && findings.size > 0) {
  for (const { category, location } of findings.values()) {
    process.stderr.write(`${category} | ${sanitizeDiagnostic(location)} | ${REMEDIATION}\n`);
  }
  process.exitCode = 1;
} else if (process.exitCode === undefined) {
  process.stdout.write("最终审计通过：当前受控文件、完整 Git 历史与可用静态 Web artifact 未发现命中。\n");
}
