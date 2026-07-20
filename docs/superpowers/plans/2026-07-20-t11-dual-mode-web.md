# T11 Dual-Mode WebUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付不含凭据入口的 GitLab Pages 静态演示，以及用户在本机显式启动、可手动填写 OpenAI-compatible API 配置并运行完整 Harness 的 WebUI。

**Architecture:** 静态与本地模式使用不同的 Web 入口，保证 Pages bundle 不导入本地表单或 API client。本地页面经 Vite 同源代理调用只监听 `127.0.0.1` 的 Fastify；API 复用从 CLI 抽出的 Harness runner，只允许请求覆盖任务与 Provider，其他治理边界来自本地配置。

**Tech Stack:** Node.js 24.14.x、pnpm 11.14.0、TypeScript 6 strict、Fastify 5.10、React 19.2、Vite 8.1、Vitest 4.1、GitLab CI/Pages。

## Global Constraints

- Node.js 必须满足 `>=24.0.0 <25.0.0`，pnpm 必须为 `11.14.0`；使用仓库现有 lockfile 和依赖，不升级版本、不新增运行时依赖。
- 所有新增或修改的源码注释使用中文；Git 提交格式为 `类型: 中文解释`。
- 禁止现成 Agent Runner；不得改变 `Action`、`LLMProvider`、`AgentLoop.run()` 的公开协议。
- Pages 构建不导入本地表单、API client、localhost 地址或 Key 字段，只消费固定 fake 数据。
- API Key 不进入命令参数、环境变量、URL、localStorage、sessionStorage、IndexedDB、配置文件、日志、Trace、Memory、响应回显、测试快照或 Git。
- Fastify 只监听 `127.0.0.1`；`POST /api/runs` 只接受允许的本地 Vite Origin、`application/json` 和不超过 32 KiB 的请求体。
- 请求只能提供 `task`、`baseUrl`、`model`、`apiKey`；工作区、允许命令、最大步数、命令超时、输出上限和 Memory 路径必须读取 `.ai4se/config.json`。
- Web 模式不实现交互式批准；Policy `ask` 使用无 handler 的 `ApprovalGate`，确定性返回 blocked，工具零副作用。
- 远端 Provider 只允许 HTTPS；`localhost`、`127.0.0.1`、`::1` 可使用 HTTP；不跟随重定向、不自动重试。
- 不实现 SSE、WebSocket、取消、历史记录、登录、多用户、远程工作区或线上后端。
- 每个实现任务先观察正确 RED，再写最小 GREEN；自动测试和 CI 不使用真实学校 API 或真实 Key。

---

### Task 1: 可复用 Harness runner 与回环 Fastify API

**Files:**
- Create: `apps/api/src/run-task.ts`
- Create: `apps/api/src/local-web-server.ts`
- Create: `apps/api/src/server-entry.ts`
- Create: `tests/integration/api/local-web-server.test.ts`
- Modify: `apps/api/src/cli.ts`
- Modify: `apps/api/package.json`
- Modify: `packages/harness/src/agent-loop.ts`
- Modify: `tests/integration/harness/agent-loop.test.ts`
- Test: `tests/integration/api/cli.test.ts`

**Interfaces:**
- Produces `runHarnessTask(options: RunHarnessTaskOptions): Promise<RunTaskResult>` where `provider.apiKey` is required and `provider.baseUrl`/`provider.model` optionally override the validated file configuration.
- Produces `buildLocalWebServer(options: LocalWebServerOptions): FastifyInstance`; `options.runTask` is injectable for route tests and defaults to `runHarnessTask`.
- `POST /api/runs` consumes `{ task, baseUrl, model, apiKey }` and returns either a `RunResult` or `{ error: { code, message } }` without echoing input.
- CLI consumes `runHarnessTask` and preserves all existing output, exit codes, credential commands and cached approval behavior.

- [ ] **Step 1: Write the failing provider stop-reason and API tests**

Add this focused AgentLoop case to `tests/integration/harness/agent-loop.test.ts`:

```ts
it("保留已知 Provider 错误代码但不泄露异常正文", async () => {
  const harness = await createHarness([]);
  const provider = {
    complete: vi.fn(async () => {
      throw Object.assign(new Error("secret remote body"), {
        code: "PROVIDER_RATE_LIMITED"
      });
    })
  };
  const loop = new AgentLoop({
    provider,
    memory: harness.memory,
    dispatcher: new Dispatcher(),
    trace: harness.trace,
    policy: new PolicyEngine({ allowedCommands: [] })
  });

  const result = await loop.run("rate limited");

  expect(result.trace.at(-1)).toMatchObject({
    status: "failed",
    stopReason: "provider_rate_limited"
  });
  expect(JSON.stringify(result)).not.toContain("secret remote body");
});
```

Create `tests/integration/api/local-web-server.test.ts` with real Fastify injection and a local Chat Completions stub. Cover these exact cases:

```ts
const validBody = {
  task: "finish safely",
  baseUrl: stub.baseUrl,
  model: "stub-model",
  apiKey: "sk-local-web-test-only"
};

expect(await app.inject({
  method: "POST",
  url: "/api/runs",
  headers: {
    origin: "http://127.0.0.1:5173",
    "content-type": "application/json"
  },
  payload: validBody
})).toMatchObject({ statusCode: 200 });
```

The file must additionally assert:

```ts
expect(result.json()).toMatchObject({ status: "completed", summary: "done" });
expect(result.body).not.toContain(validBody.apiKey);
expect(await readFile(join(cwd, ".ai4se", "trace.json"), "utf8"))
  .not.toContain(validBody.apiKey);
```

Use table tests for unknown/missing fields, blank strings, non-local remote HTTP, absent/wrong Origin and non-JSON content. Assert stable codes `RUN_REQUEST_INVALID`, `RUN_ORIGIN_FORBIDDEN`, `RUN_CONTENT_TYPE_INVALID`, and no injected runner call. Stub a write Action and assert status `blocked`, `stopReason: "APPROVAL_REQUIRED"`, and no file creation. Use an injected runner throwing an error containing the test Key and assert `RUN_INTERNAL_ERROR` with no leak.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
pnpm vitest run tests/integration/harness/agent-loop.test.ts tests/integration/api/local-web-server.test.ts tests/integration/api/cli.test.ts
```

Expected: FAIL because `buildLocalWebServer` and `runHarnessTask` do not exist and AgentLoop still emits generic `provider_error`.

- [ ] **Step 3: Implement the shared runner**

Create `apps/api/src/run-task.ts` around the existing assembly currently inside `cli.ts`:

```ts
export interface RunHarnessTaskOptions {
  readonly cwd: string;
  readonly configPath: string;
  readonly task: string;
  readonly provider: {
    readonly apiKey: string;
    readonly baseUrl?: string;
    readonly model?: string;
  };
  readonly approval?: ApprovalHandler;
}

export type RunTaskErrorCode = "RUN_CONFIG_READ_FAILED" | "RUN_CONFIG_INVALID";
export type RunTaskResult =
  | { readonly ok: true; readonly value: RunResult }
  | { readonly ok: false; readonly error: { readonly code: RunTaskErrorCode; readonly message: string } };

export async function runHarnessTask(
  options: RunHarnessTaskOptions
): Promise<RunTaskResult>;
```

Implementation requirements:

```ts
const configured = parseHarnessConfig(JSON.parse(await readFile(options.configPath, "utf8")));
const workspace = resolve(options.cwd, configured.value.workspace);
const redactor = new Redactor([options.provider.apiKey]);
const provider = new OpenAICompatibleProvider({
  baseUrl: options.provider.baseUrl ?? configured.value.provider.baseUrl,
  model: options.provider.model ?? configured.value.provider.model,
  apiKey: options.provider.apiKey
});
```

Register the same four tools as the old CLI, construct `JsonMemory`, `JsonTrace`, `PolicyEngine`, `ApprovalGate`, `CommandTool`, and return `{ ok: true, value: await loop.run(task) }`. Catch only config read/parse failures into stable errors; do not serialize `options` or exception causes. Move `cachedApproval` only if needed by CLI; Web must pass no approval handler.

- [ ] **Step 4: Preserve safe Provider error categories**

In `packages/harness/src/agent-loop.ts`, add a closed allowlist mapper:

```ts
const PROVIDER_STOP_REASONS = new Map<string, string>([
  ["PROVIDER_AUTHENTICATION_FAILED", "provider_authentication_failed"],
  ["PROVIDER_RATE_LIMITED", "provider_rate_limited"],
  ["PROVIDER_SERVER_ERROR", "provider_server_error"],
  ["PROVIDER_HTTP_ERROR", "provider_http_error"],
  ["PROVIDER_NETWORK_ERROR", "provider_network_error"],
  ["PROVIDER_RESPONSE_INVALID", "provider_response_invalid"],
  ["PROVIDER_ACTION_INVALID", "provider_action_invalid"]
]);

function providerStopReason(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "provider_error";
  }
  return typeof error.code === "string"
    ? PROVIDER_STOP_REASONS.get(error.code) ?? "provider_error"
    : "provider_error";
}
```

Use the mapped value only for `stopReason`; keep the observation and summary generic so exception messages and remote bodies never appear.

- [ ] **Step 5: Implement the Fastify factory and process entry**

Create `apps/api/src/local-web-server.ts` with these exact public types and constants:

```ts
export interface LocalRunRequest {
  readonly task: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export interface LocalWebServerOptions {
  readonly cwd: string;
  readonly configPath?: string;
  readonly allowedOrigins?: readonly string[];
  readonly runTask?: typeof runHarnessTask;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173"
] as const;

export function buildLocalWebServer(options: LocalWebServerOptions): FastifyInstance;
```

Build Fastify with `{ logger: false, bodyLimit: 32 * 1024 }`. Before invoking the runner, require an allowed `Origin`, exact JSON content type, an object with exactly the four fields, nonblank values, and `validProviderBaseUrl(baseUrl)`. Use `join(cwd, ".ai4se", "config.json")` as default config. Map runner config failures to status 422, validation to 400, origin to 403, media type to 415, and unexpected failures to 500. Every error body contains only a stable code and fixed Chinese message.

Create `apps/api/src/server-entry.ts`:

```ts
import { buildLocalWebServer } from "./local-web-server.js";

const parsedPort = Number.parseInt(process.env.AI4SE_LOCAL_API_PORT ?? "4174", 10);
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
  throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
}

const app = buildLocalWebServer({ cwd: process.cwd() });
await app.listen({ host: "127.0.0.1", port: parsedPort });
```

Add `"start:web": "node dist/server-entry.js"` to `apps/api/package.json`.

- [ ] **Step 6: Refactor CLI to call the shared runner**

Keep argument parsing and credential commands in `cli.ts`. After reading the encrypted credential, call:

```ts
const result = await runHarnessTask({
  cwd: dependencies.cwd,
  configPath: arguments_.configPath,
  task: arguments_.task,
  provider: { apiKey: credential.value },
  approval: dependencies.askApproval === undefined
    ? undefined
    : cachedApproval(dependencies.askApproval)
});
```

Map config result codes to the existing fixed CLI messages and preserve completed/non-completed exit codes exactly. Delete only imports and assembly code made redundant by the extraction.

- [ ] **Step 7: Run GREEN and commit**

Run:

```powershell
pnpm vitest run tests/integration/harness/agent-loop.test.ts tests/integration/api/local-web-server.test.ts tests/integration/api/cli.test.ts
pnpm --filter @ai4se/api typecheck
pnpm --filter @ai4se/api build
pnpm lint
```

Expected: all focused tests pass; API typecheck/build and lint exit 0.

Commit:

```powershell
git add apps/api packages/harness/src/agent-loop.ts tests/integration/api tests/integration/harness/agent-loop.test.ts
git commit -m "feat: 增加T11本地运行API"
```

---

### Task 2: 静态与本地入口完全分离的 WebUI

**Files:**
- Create: `apps/web/src/demo-data.ts`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/LocalApp.tsx`
- Create: `apps/web/src/local-run-client.ts`
- Create: `apps/web/src/main.local.tsx`
- Create: `apps/web/src/styles.css`
- Create: `tests/unit/web/static-page.test.ts`
- Create: `tests/unit/web/local-run-client.test.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- `App` is the public static page and imports only `demo-data.ts` plus styles through its entry.
- `LocalApp` composes `<App />` and the local runner form; only `main.local.tsx` imports it.
- `submitLocalRun(request, send = runLocalAgent)` always resolves to `{ apiKey: "", result?, error? }`, so callers clear the controlled Key after both success and failure.
- Vite `mode === "local"` rewrites the HTML entry from `/src/main.tsx` to `/src/main.local.tsx`; default build remains static.

- [ ] **Step 1: Write the failing static/local contract tests**

Create `tests/unit/web/static-page.test.ts` using `renderToStaticMarkup`:

```ts
const html = renderToStaticMarkup(createElement(App));

expect(html).toContain("Coding Agent Harness");
expect(html).toContain("固定 mock 轨迹");
expect(html).toContain("治理阻断");
expect(html).toContain("失败反馈修正");
expect(html).toContain("Memory 摘要");
expect(html).toContain("pnpm demo");
expect(html.indexOf("Step 1")).toBeLessThan(html.indexOf("Step 2"));
expect(html).not.toMatch(/<form|<input|type="password"|\/api\/runs|localhost/iu);
```

Render `LocalApp` separately and require labelled task/baseUrl/model inputs, `type="password"`, one submit button, the local-only warning, and the static content. Assert semantic `header`, `nav`, `main`, `section`, `footer` and visible status text.

Create `tests/unit/web/local-run-client.test.ts`:

```ts
const request = {
  task: "finish safely",
  baseUrl: "https://provider.example/v1",
  model: "course-model",
  apiKey: "sk-client-test-only"
};
const send = vi.fn(async () => ({ status: "completed", summary: "done", steps: 1, trace: [] }));

await expect(submitLocalRun(request, send)).resolves.toMatchObject({
  apiKey: "",
  result: { status: "completed" }
});
expect(send).toHaveBeenCalledWith(request);
```

Repeat with a rejected promise and assert `apiKey: ""`, fixed error text, and no secret in `JSON.stringify(result)`. Stub `fetch` for `runLocalAgent`, assert exactly one `POST /api/runs`, JSON content type, no retry, stable handling of non-2xx, and no use of `localStorage`/`sessionStorage` anywhere in `apps/web/src`.

- [ ] **Step 2: Run Web tests and verify RED**

Run:

```powershell
pnpm vitest run tests/unit/web/static-page.test.ts tests/unit/web/local-run-client.test.ts
```

Expected: FAIL because App, LocalApp, demo data and local client do not exist.

- [ ] **Step 3: Implement typed fake data and static App**

In `demo-data.ts`, export readonly structures for architecture nodes, three mechanisms, memory summaries, commands and two ordered mock runs. Use only fake values. One run demonstrates feedback correction and completion; the other independently demonstrates a dangerous action being blocked, because a blocked Harness run cannot continue to `finish`:

```ts
export const demoRuns = [
  {
    id: "feedback-correction",
    entries: [
      { step: 1, action: "run_command pnpm test", policy: "allow", observation: "fail: 1 test failed", status: "running" },
      { step: 2, action: "read_file failing-test.ts", policy: "allow", observation: "pass: focused context loaded", status: "running" },
      { step: 3, action: "finish", policy: "allow", observation: "pass: finish", status: "completed", stopReason: "finish" }
    ]
  },
  {
    id: "governance-block",
    entries: [
      { step: 1, action: "write_file .ai4se/credentials.json", policy: "deny", observation: "blocked: sensitive path", status: "blocked", stopReason: "policy_denied" }
    ]
  }
] as const;
```

`App.tsx` renders a skip link, `header/nav/main/section/footer`, hero and static-boundary callout, architecture, mechanism cards, ordered Trace, Memory summaries, command blocks and security limitations. It must not import `LocalApp` or `local-run-client`.

- [ ] **Step 4: Implement local client and controlled form**

In `local-run-client.ts` define request/response types matching Task 1 and:

```ts
export async function runLocalAgent(
  request: LocalRunRequest,
  fetchImpl: typeof fetch = fetch
): Promise<LocalRunResponse>;

export async function submitLocalRun(
  request: LocalRunRequest,
  send: (request: LocalRunRequest) => Promise<LocalRunResponse> = runLocalAgent
): Promise<{
  readonly apiKey: "";
  readonly result?: LocalRunResponse;
  readonly error?: string;
}>;
```

`runLocalAgent` performs exactly one request and throws only fixed local messages. `submitLocalRun` uses `try/catch/finally` semantics and never includes the Key in the returned object or error.

`LocalApp.tsx` uses controlled React state for the four fields and submit status. Do not persist state. Disable submit while running. In the submit handler, copy the current request only for the call, await `submitLocalRun`, then set Key to `outcome.apiKey` for both success and failure. Display returned ordered Trace or the fixed error in an `aria-live="polite"` status area. Explain that `ask` actions are rejected and CLI is required for encrypted persistent credentials/approval.

- [ ] **Step 5: Implement separate entries and Vite mode selection**

`main.tsx` mounts only `<App />`; `main.local.tsx` mounts only `<LocalApp />`. Both import `styles.css`.

Replace `vite.config.ts` with a configuration factory:

```ts
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [
    react(),
    ...(mode === "local" ? [{
      name: "ai4se-local-entry",
      transformIndexHtml(html: string) {
        return html.replace("/src/main.tsx", "/src/main.local.tsx");
      }
    }] : [])
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4174" }
  }
}));
```

Add `"dev:local": "vite --mode local --strictPort"` and focused `test` script to `apps/web/package.json`. Do not add dependencies.

- [ ] **Step 6: Implement accessible responsive CSS**

Use CSS custom properties for neutral background, ink, muted text, border, allow/ask/deny/success colors; use a centered max-width layout, responsive grid cards, horizontal-safe Trace, wrapping code, `:focus-visible` outline, `.skip-link`, and a single-column breakpoint at 720px. Do not reference remote fonts, images, stylesheets or scripts. Respect `prefers-reduced-motion` by avoiding required motion entirely.

- [ ] **Step 7: Run GREEN, build both modes, scan artifact and commit**

Run:

```powershell
pnpm vitest run tests/unit/web/static-page.test.ts tests/unit/web/local-run-client.test.ts
pnpm --filter @ai4se/web typecheck
pnpm --filter @ai4se/web build
Get-ChildItem -File -Recurse apps/web/dist | Select-String -Pattern '/api/runs|127\.0\.0\.1|localhost|type="password"|sk-'
pnpm --filter @ai4se/web exec vite build --mode local
pnpm lint
```

Expected: tests/typecheck/build/lint exit 0; static artifact scan prints no matches; local build succeeds and may replace the ignored `apps/web/dist` output. The later full root build recreates the default static artifact.

Commit only source/tests/package changes:

```powershell
git add apps/web tests/unit/web
git commit -m "feat: 实现T11双模式Web页面"
```

---

### Task 3: 单命令本地启动、GitLab Pages 与交付记录

**Files:**
- Create: `scripts/local-web.mjs`
- Modify: `package.json`
- Modify: `.gitlab-ci.yml`
- Modify: `tests/unit/ci/pipeline-contract.test.ts`
- Modify: `PLAN.md`
- Modify: `AGENT_LOG.md`

**Interfaces:**
- Root `pnpm web:local` first builds Harness/API, then `scripts/local-web.mjs` starts the compiled API and `vite --mode local` together; terminating the parent terminates both children.
- GitLab job remains exactly `unit-test`; `pages` depends on it, builds default static Web, copies only `apps/web/dist` contents into `public`, and exposes `public` artifact.

- [ ] **Step 1: Write failing CI and launcher contract tests**

Extend `tests/unit/ci/pipeline-contract.test.ts` to read `.gitlab-ci.yml`, `package.json`, and `scripts/local-web.mjs`. Assert:

```ts
expect(ci).toMatch(/^unit-test:/mu);
expect(ci).toMatch(/^pages:/mu);
expect(ci).toContain("- pnpm --filter @ai4se/web build");
expect(ci).toContain("- cp -R apps/web/dist/. public/");
expect(ci).toContain("paths:\n      - public");
expect(ci).not.toMatch(/API_KEY|OPENAI_API_KEY|credentials\.json/iu);
expect(rootPackage.scripts["web:local"]).toBeDefined();
expect(launcher).toContain("127.0.0.1");
```

Also assert `pages` has `needs: ["unit-test"]`, runs only for `$CI_DEFAULT_BRANCH`, and no artifact path under `.ai4se`.

- [ ] **Step 2: Run CI contract and verify RED**

Run:

```powershell
pnpm vitest run tests/unit/ci/pipeline-contract.test.ts
```

Expected: FAIL because `pages`, `web:local` and launcher do not exist.

- [ ] **Step 3: Implement the local process launcher**

Create `scripts/local-web.mjs` using only Node built-ins. Obtain pnpm from `process.env.npm_execpath`; reject if absent. Spawn with `shell: false`:

```js
const api = spawn(process.execPath, ["apps/api/dist/server-entry.js"], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});
const web = spawn(process.execPath, [pnpmCli, "--filter", "@ai4se/web", "dev:local"], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});
```

Handle `SIGINT`, `SIGTERM`, child `error`, and premature child `exit`; send one termination signal to the still-running peer and set a nonzero exit code for unexpected failure. Comments, if any, must be Chinese. Do not print environment values or request contents.

Add root scripts:

```json
"web:local": "pnpm --filter @ai4se/harness build && pnpm --filter @ai4se/api build && node scripts/local-web.mjs"
```

- [ ] **Step 4: Add the Pages job**

Update `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - deploy

pages:
  stage: deploy
  image: node:24.14.0-bookworm-slim
  needs: ["unit-test"]
  variables:
    CI: "true"
  before_script:
    - corepack enable
    - corepack prepare pnpm@11.14.0 --activate
  script:
    - pnpm install --frozen-lockfile
    - pnpm --filter @ai4se/web build
    - mkdir public
    - cp -R apps/web/dist/. public/
  artifacts:
    paths:
      - public
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

Do not add environment secrets or publish API artifacts.

- [ ] **Step 5: Verify contracts and manually smoke the local pair**

Run:

```powershell
pnpm vitest run tests/unit/ci/pipeline-contract.test.ts
pnpm web:local
```

Expected: contract test passes; launcher reports API on `127.0.0.1:4174` and Vite on `127.0.0.1:5173`. Stop with Ctrl+C after confirming both processes terminate. Do not enter a real Key during this smoke.

- [ ] **Step 6: Run complete verification, review, and update evidence**

Run fresh:

```powershell
pnpm test
pnpm demo
pnpm lint
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Update `PLAN.md` T11 execution evidence and `AGENT_LOG.md` with actual commands/results, RED/GREEN evidence, review findings, commit ids and any unresolved external evidence. Do not claim a Pipeline, Pages URL, MR or real school API smoke unless actually observed.

Commit:

```powershell
git add scripts/local-web.mjs package.json .gitlab-ci.yml tests/unit/ci/pipeline-contract.test.ts PLAN.md AGENT_LOG.md
git commit -m "ci: 发布T11静态页面并记录审查"
```

---

### Task 4: 清空 T11 规划并交接远程操作

**Files:**
- Modify: `guiding.md`

**Interfaces:**
- Produces an empty tracked `guiding.md` as the final T11 branch commit.
- Leaves push, MR, Pipeline, Pages URL and real school API smoke to the project owner.

- [ ] **Step 1: Confirm the branch gate**

Run:

```powershell
git log --oneline dev..HEAD
git status --short
git diff --check dev...HEAD
```

Expected: six T11 commits before cleanup, no unintended files, no diff errors, and all Task 1–3 review gates closed.

- [ ] **Step 2: Empty only `guiding.md` and commit**

Use `apply_patch` to remove the contents while preserving the file. Then run:

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git add guiding.md
git commit -m "docs: 清空T11任务规划"
```

Expected: the branch has at most seven commits after `dev`, and `guiding.md` is a tracked zero-byte file.

- [ ] **Step 3: Final handoff**

Report all fresh verification results and explicitly list owner-only actions:

```text
1. 手动填写学校 API endpoint、model 和 Key，执行一次本地真实 smoke。
2. 推送 feat/t11-static-web。
3. 创建目标为 dev 的非 squash MR。
4. 等待 Pipeline passed，记录真实 Pages URL 后合并。
```

Do not perform those remote or secret-bearing operations as the agent.
