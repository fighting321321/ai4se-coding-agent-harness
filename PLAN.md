# Coding Agent Harness 课程最小实现计划

> **v2.0.4 补丁（2026-08-01）：** 成功命令的脱敏、限长 stdout/stderr 必须进入下一轮 Observation；无输出命令仍只报告退出码，防止列目录等动作因结果丢失而重复到 `max_steps`。

> **v2.0.3 补丁（2026-08-01）：** 每次 Provider 调用都声明实际运行平台，要求已知文件优先使用 `read_file`，禁止模型选择 Shell，并在缺少 `list_files` 时指引其使用受审批的 Node.js `node:fs` API 列目录。

> **v2.0.2 补丁（2026-08-01）：** 交互式 CLI 对未预授权的普通命令显示完整命令并逐次询问；用户批准后仅执行本次调用。Shell、删除类命令和越界动作继续固定拒绝，不把临时批准写入持久白名单。

> **v2.0.1 补丁（2026-08-01）：** 保持 Harness 功能与安全边界不变，仅让 `ai4se>` 提示符与用户输入同行，并在输入和输出之间增加空行；同步更新终端契约测试、分发包、提交材料与 GitLab Release。

> **状态修正（2026-08-01）：** T17 已完成 Trace v3、最终离线验收矩阵、`@ai4se/harness` 2.0.0 打包与全新目录 smoke；真实 Provider 只读验收已通过，T17 已合入 `dev`，当前只剩 `main`、`v2.0.0` 标签与 GitLab Release 发布。

> **路线 B 初始化边界（2026-07-24）：** 首次运行只允许向用户收集服务地址、隐藏 API Key 和模型名称；三项均由用户直接填写。当前目录自动成为工作区，其余配置全部由程序内部生成。普通流程不得要求选择 Provider、选择预设模型、编辑 JSON、指定路径或设置本地保护密码；`v1.1.0` 的主密码流程仅作为历史兼容实现。

> **For agentic workers:** 按 T06–T12 串行执行；每个 Task 使用独立 branch/worktree、一次新鲜 subagent、TDD、Spec 检查、质量检查和 MR Pipeline。步骤用 `guiding.md` 细化，不扩展本计划范围。

**版本：** 2.9.0

**SPEC 基线：** `SPEC.md` 2.7.0

**目标日期：** 2026-07-25

**当前状态：** G1–G3、T01–T17 已完成并合入 `dev`；代码、测试和提交材料已收尾，等待完成正式发布。

### 路线 B 剩余任务（简化）

1. 受限子 Agent、自动反馈传感器和 Checkpoint 恢复。
2. 完整 Trace、真实 Provider、tarball 与 `v2.0.0` Release 验收。

执行纪律：一次只做上述一个单项，默认最多一个提交；每项通过统一 `all` 门禁后停止并由负责人决定是否继续。

## 1. 目标与最小边界

在 T05 的可运行骨架上，用 T06–T12 交付满足原始课程要求的最小 Coding Agent Harness：自研循环、六维最低实现、反馈重点维度、mock 测试、三项演示、安全凭据、真实学校 API 本地入口、本地 WebUI、GitLab Release npm tarball、README、过程证据和本人反思。

不实现数据库、多用户、SSE、Rebaseline、复杂审批、Docker 或线上后端。

## 2. 固定架构与接口

```text
apps/api → packages/harness
apps/web（静态 mock；本地显式模式 → apps/api）
tests（跨模块测试与演示）
```

```ts
type Action =
  | { type: "read_file"; path: string }
  | { type: "write_file"; path: string; content: string }
  | { type: "run_command"; executable: string; args: readonly string[] }
  | { type: "finish"; summary: string };

interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}

interface AgentLoop {
  run(task: string): Promise<RunResult>;
}
```

命令不得使用 Shell 字符串；静态 Web 不依赖 API；本地 Web 只把单次 Key 发送给回环 Fastify，Key 不落盘、不进日志/Trace/Memory/URL/浏览器存储，日常安全凭据仍由 CLI 加密模块管理。

## 3. 统一轻量执行规则

每个 Txx：

1. 从最新 `dev` 建独立 branch/worktree，首提交写精简 `guiding.md`。
2. 派一个新鲜 subagent，只提供 SPEC、PLAN 和当前 Task 文件。
3. 每个功能保留一次真实 RED → GREEN；不做重复复检。
4. 完成后先做一次 Spec 合规检查，再做一次代码质量检查；只强制修复 Critical。
5. 运行一次完整门禁：

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

6. 更新 PLAN/AGENT_LOG，末提交清空 `guiding.md`，推送 MR；Pipeline passed 后合入 `dev`，禁止 squash。

每个后续 Task 最多 7 个提交，目标 5–6 个。任务严格串行，不维护复杂并行 DAG。

## 4. 状态总览

| Task | 内容 | 分支 | 状态 | 提交上限 |
| --- | --- | --- | --- | ---: |
| T05 | 工程骨架与最小 CI | `chore/t05-project-foundation` | 已合入 `dev`（MR !6，merge `f014b42`） | 历史例外 |
| T06 | Action、LLM 抽象、mock、解析与分发 | `feat/t06-minimal-kernel` | 已合入 `dev`（MR !7，merge `cdcc01f`） | 5 |
| T07 | 受限工具、治理与最小批准 | `feat/t07-safe-tools-policy` | 已合入 `dev`（MR !8，merge `4fb39c7`） | 7 |
| T08 | 配置、JSON Memory 与脱敏 Trace | `feat/t08-config-memory` | 已合入 `dev`（MR !9，merge `6de04f9`） | 5 |
| T09 | 反馈重点维度与自研 Agent Loop | `feat/t09-feedback-loop` | 已合入 `dev`（MR !11，merge `3b0d3fe`） | 6 |
| T10 | 安全凭据、真实 Provider、CLI 与三演示 | `feat/t10-cli-provider-demo` | 已合入 `dev`（MR !12，merge `64458b8`） | 7 |
| T11 | 双模式 WebUI、本地 API 与静态 mock | `feat/t11-static-web` | 已合入 `dev`（MR !13，merge `7c68221`）；学校 Pages 不可用，托管交付由 Release 取代 | 7 |
| T12 | npm 分发、README、反思与最终审计 | `docs/t12-final-delivery` | 已合入 `dev`（MR !14，merge `6f8b5d6`） | 7 |
| T13 | 完整短期会话、命令、规则与压缩 | `feat/t13-session-context-rules` | 已合入 `dev`（merge `32006ec`） | 7 |
| T14 | 长期 Memory 生命周期、重启恢复与管理 | `feat/t14-memory-lifecycle` | 已合入 `dev`（merge `e9a6e2a`） | 7 |
| T15 | Skill、MCP 与生命周期 Hooks | `feat/t15-skills-mcp-hooks` | 已合入 `dev`（merge `77e9e78`） | 7 |
| T16 | 受限子 Agent、Sensor 与 Checkpoint | `feat/t16-subagent-feedback-checkpoint` | 已合入 `dev`（merge `76252af`） | 7 |
| T17 | Trace、最终离线验收与 v2.0.0 分发准备 | `release/t17-harness-v2` | 离线候选已准备，等待总控外部步骤 | 7 |

## 5. T05：工程骨架与最小 CI（已完成）

**产物：** Node 24/pnpm 11 workspace、API/Web/Harness/tests、健康测试、`unit-test` GitLab job。

**主要提交：** `fbd796d`、`3d70dd4`、`62b95da`、`2e902e0`。

**合并：** MR !6 → `dev`，merge commit `f014b42`。

**最终审计：** 最终 `main` Pipeline `#313989` 已通过；早期 MR 的逐条状态保留在 GitLab 历史中，不再作为交付阻断项。

## 6. T06：最小决策与分发内核

**目标：** 完成决策封装的最小可测试内核，不实现真实工具或循环。

**Files：**

- Create `packages/harness/src/action.ts`
- Create `packages/harness/src/llm-provider.ts`
- Create `packages/harness/src/scripted-mock-llm.ts`
- Create `packages/harness/src/action-parser.ts`
- Create `packages/harness/src/dispatcher.ts`
- Modify `packages/harness/src/index.ts`
- Create `tests/unit/harness/action-parser.test.ts`
- Create `tests/unit/harness/scripted-mock-llm.test.ts`
- Create `tests/unit/harness/dispatcher.test.ts`

**行为：**

- `ScriptedMockLLM` 按顺序返回脚本并记录调用，耗尽时返回明确错误。
- Parser 严格接受 SPEC 四类 Action；`run_command` 必须是 executable + args。
- Dispatcher 每次只分发一个 Action；未知类型和 handler 异常转结构化结果。

**TDD：** 先写 mock 顺序/耗尽、非法 Action、单次分发 RED；再做最小实现并 GREEN。

**聚焦验证：**

```powershell
pnpm vitest run tests/unit/harness/action-parser.test.ts tests/unit/harness/scripted-mock-llm.test.ts tests/unit/harness/dispatcher.test.ts
```

**执行证据（2026-07-18）：** RED 为 3 个文件、15 个用例因 T06 导出不存在而失败；提交 `e419138` 固化测试后，提交 `c4eae99` 完成最小实现，聚焦测试 3/3 文件、15/15 用例 GREEN。Spec 与质量检查均无 Critical；完整门禁为 5/5 测试文件、17/17 用例通过，lint、typecheck、build 全部退出码 0。MR !7 已以 `cdcc01f` 合入 `dev`；Pipeline 状态留待最终审计补录。

**建议提交：** 规划；RED 测试；最小内核；评审/记录；清空 guiding。

## 7. T07：受限工具、治理与最小批准

**依赖：** T06。

**Files：**

- Create `packages/harness/src/path-guard.ts`
- Create `packages/harness/src/file-tools.ts`
- Create `packages/harness/src/command-tool.ts`
- Create `packages/harness/src/policy.ts`
- Create `packages/harness/src/approval.ts`
- Modify `packages/harness/src/dispatcher.ts`, `packages/harness/src/index.ts`
- Create corresponding tests under `tests/unit/harness/`

**行为：**

- 路径限制在 workspace，拒绝绝对路径、`..`、`.env` 和符号链接逃逸。
- 命令以 `spawn(executable,args)` 运行；白名单、60 秒超时、32 KiB 输出上限。
- Policy 返回 allow/ask/deny；删除类和 Shell 启动器 deny，写入可 ask。
- ask 在当前 CLI 会话中等待一次明确批准；批准前工具调用为零。

**TDD：** 路径逃逸、危险命令、未批准写入先 RED；实现后断言副作用计数为零并 GREEN。

**聚焦验证：**

```powershell
pnpm vitest run tests/unit/harness/path-guard.test.ts tests/unit/harness/file-tools.test.ts tests/unit/harness/command-tool.test.ts tests/unit/harness/policy.test.ts
```

**执行证据（2026-07-18）：** 规划提交 `2b7b7f6` 后，提交 `f05cee2` 先固化 5 个 T07 测试文件；有效 RED 为 26 个用例因 T07 构造器/导出不存在而失败，T06 的 17 个既有用例继续通过。`b58f477`、`3d580e0` 分别实现受限工具与治理/批准；独立审查发现命令参数绕过、真实敏感目标别名和无界超时 3 个 Critical，修复提交 `1524de3` 以精确 `executable + args` 规则、真实路径敏感复检、有界进程终止及删除命令无条件拒绝关闭问题。复审的 Spec compliance 与 Task quality 均 PASS；合并后审计又用 RED/GREEN 补齐 `dash/fish`、`git rm` 与 `git reset --hard` 拦截。保留的非阻断项为 realpath 到打开之间的 TOCTOU、Policy 的词法路径判断、Windows 进程树终止确认和根目录 workspace 新文件切片。MR !8 已以 `4fb39c7` 合入 `dev`；Pipeline 状态留待最终审计补录。

**建议提交：** 规划；RED；文件/命令工具；Policy/批准；评审/记录；清空 guiding。

## 8. T08：配置、JSON Memory 与脱敏 Trace（已完成）

**依赖：** T07。

**Files：**

- Create `packages/harness/src/config.ts`
- Create `packages/harness/src/json-memory.ts`
- Create `packages/harness/src/redactor.ts`
- Create `packages/harness/src/trace.ts`
- Create corresponding unit tests
- Modify `.gitignore`, `packages/harness/src/index.ts`

**行为：**

- JSON 配置严格校验 workspace、allowlist、步数、超时、输出、Memory 路径；Key 不进入配置。
- Memory 支持写入、相关检索、更新、清除；损坏 JSON 明确失败。
- Trace 记录每轮 Action/Policy/Observation/停机原因并统一脱敏。

**TDD：** 错误配置、Memory 往返/损坏、fake Key 跨 Memory/Trace 零明文先 RED 后 GREEN。

**聚焦验证：**

```powershell
pnpm vitest run tests/unit/harness/config.test.ts tests/unit/harness/json-memory.test.ts tests/unit/harness/redactor.test.ts tests/unit/harness/trace.test.ts
```

**执行证据（2026-07-18）：** 规划提交 `85bbf15` 后，提交 `6b70a29` 先固化 4 个测试文件；有效 RED 为 21 个用例因 T08 公共导出不存在而失败。`ace9242` 实现严格配置、原子 JSON Memory、统一 Redactor 与结构化 Trace；聚焦测试初次 GREEN 为 21/21。评审补齐嵌套未知字段、空白路径、独立 `sk-…` 形态、重复 Memory id 和重复 Trace step，最终聚焦测试为 27/27。完整门禁为 14/14 测试文件、100/100 用例通过。MR !9 已以 `6de04f9` 合入 `dev`；合并后收尾又用 4 个 RED/GREEN 用例修复合法字段中的 Key 值、无 Action 的 running Trace 以及 Memory 非数组查询参数。未增加依赖、数据库、Agent Loop、真实 Provider、CLI 或 WebUI。

**建议提交：** 规划；RED；配置/Memory/Trace；评审/记录；清空 guiding。

## 9. T09：反馈重点维度与 Agent Loop

**依赖：** T08。

**Files：**

- Create `packages/harness/src/feedback.ts`
- Create `packages/harness/src/agent-loop.ts`
- Create `tests/unit/harness/feedback.test.ts`
- Create `tests/integration/harness/agent-loop.test.ts`
- Modify `packages/harness/src/index.ts`

**行为：**

- 自研 task → context/memory → LLM → parse → policy → tool → feedback → next/stop 循环。
- 反馈分类 pass/fail/timeout/environment_error，摘要进入下一轮。
- 默认最大 8 步；业务失败只自动修正一次；第二次失败停止。
- finish、deny、ask、最大步数和环境错误都有明确 RunResult。

**TDD：** 第一次动作失败、第二次动作改变并成功；连续失败停止；危险动作零调用；finish 完成。

**聚焦验证：**

```powershell
pnpm vitest run tests/unit/harness/feedback.test.ts tests/integration/harness/agent-loop.test.ts
```

**执行证据（2026-07-19）：** 规划提交 `8ebcc58` 后，`a839e38` 先完成 Feedback 的真实 RED→GREEN，`5933435` 只提交 AgentLoop 行为 RED，`af8d5e5` 实现循环并吸收两轮评审修复。最终实现 4 类反馈、默认 8 步、一次业务修正、第二次业务失败停止、四种 RunStatus、Memory/Observation 回灌、Policy/Approval 零副作用阻断和脱敏 Trace；未实现 T10+。评审补强通用工具成功文案、真实脱敏/截断、timeout/错误终态及默认 8 步覆盖。MR !11 已以 `3b0d3fe` 合入 `dev`。合并后又以真实 RED→GREEN 收尾：由 AgentLoop 统一执行 Policy/Approval，避免裸 Dispatcher 绕过批准；非零命令的脱敏 stdout/stderr 摘要会回灌；同一 Trace 可连续运行且保持 step 唯一。收尾完整门禁为 16/16 测试文件、124/124 用例通过，lint、typecheck、build 均退出码 0。

**建议提交：** 规划；反馈 RED/GREEN；Loop RED；Loop GREEN/重构；评审/记录；清空 guiding。

## 10. T10：安全凭据、真实 Provider、CLI 与机制演示

**依赖：** T09。

**Files：**

- Create `packages/harness/src/credential-store.ts`
- Create `packages/harness/src/openai-compatible-provider.ts`
- Create `apps/api/src/cli.ts`
- Create `tests/unit/harness/credential-store.test.ts`
- Create `tests/unit/harness/openai-compatible-provider.test.ts`
- Create `tests/integration/demos/mechanisms.test.ts`
- Modify package scripts and Harness exports

**行为：**

- 隐藏输入主密码；scrypt + AES-256-GCM 加密文件；支持 init/status/update/clear。
- Provider 只做单次兼容 API 调用；本地 HTTP stub 测试 401/429/5xx 与脱敏。
- `pnpm agent --task "..."` 本地运行；真实学校 API 只由负责人受控 smoke。
- `pnpm demo` 自动断言危险动作零调用、失败后改变动作、第二次失败确定性停机。

**TDD：** 加密 roundtrip/tamper、状态/更新/清除、HTTP stub、三演示全部先 RED 后 GREEN。

**聚焦验证：**

```powershell
pnpm vitest run tests/unit/harness/credential-store.test.ts tests/unit/harness/openai-compatible-provider.test.ts tests/integration/demos/mechanisms.test.ts
pnpm demo
```

**执行证据（2026-07-20）：** 分支提交依次为 `2eedd1b`（规划）、`ff73d6b`（加密凭据）、`7d6d181`（凭据并发与 KDF 安全修复）、`6842cd2`（Provider/CLI 及最终安全修复）、`ad530ab`（三项离线演示），随后补本记录与清空规划提交，最终保持 7 条上限。CredentialStore 使用显式 scrypt \(N=2^{17},r=8,p=1\) 与 AES-256-GCM、跨进程锁和原子替换，拒绝弱主密码与空 Key；Provider 对根路径、`/v1` 和完整 endpoint 正确规范化，每次只发送一次不跟随重定向的请求，远端仅允许 HTTPS、本机回环允许 HTTP；CLI 提供隐藏录入、四项凭据命令和真实 Harness 组装。三项演示全部使用 `ScriptedMockLLM` 与 fake handler，自动证明治理零调用、失败反馈改动作及第二次业务失败停机。最终全分支审查的 3 个 Important 均以 RED→GREEN 修复并复审 PASS；重写后新鲜门禁为 20/20 测试文件、214/214 用例通过，`pnpm demo` 4/4，lint、typecheck、build、diff check 均退出码 0。MR !12 已以 `64458b8` 合入 `dev`。合并后收尾又以 RED→GREEN 阻断包含当前凭据的工具 Action、让审批提示显示脱敏后的动作目标，并确保命令在配置 workspace 中执行；收尾门禁为 20/20 文件、218/218 用例及演示 4/4 通过。未执行真实学校 API smoke，未使用或记录真实 Key；Pipeline 状态留待最终审计核对。

**建议提交：** 规划；凭据；Provider/CLI；三演示；评审/记录；清空 guiding。

## 11. T11：双模式 WebUI、本地 API 与静态构建（已完成）

**依赖：** T10 的脱敏 mock Trace 格式。

**Files：**

- Modify `apps/web/src/main.tsx`, `apps/web/vite.config.ts`, `apps/web/package.json`
- Create `apps/web/src/demo-data.ts`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`
- Create `apps/web/src/local-run-client.ts`, `apps/api/src/run-task.ts`, `apps/api/src/local-web-server.ts`, `apps/api/src/server-entry.ts`, `scripts/local-web.mjs`
- Create Web/API unit and integration tests
- Refactor `apps/api/src/cli.ts` to reuse the task runner
- Modify `.gitlab-ci.yml` 增加 `pages` job

**行为：** 静态模式展示价值、架构、固定运行轨迹、治理拦截、失败修正、Memory 摘要和命令，不连接 API、不读取 Key。本地显式模式显示一次性 Provider/任务表单，经只监听 `127.0.0.1` 且校验 Origin 的 Fastify 服务运行完整 Harness；Key 不落盘、不回显，`ask` 动作默认拒绝。学校 GitLab 未提供公开 Pages 地址，因此静态构建保留为本地演示源码，不作为最终托管入口。

**TDD：** 本地 run route 验证/零泄露/默认拒绝批准、静态与本地构建边界、表单状态清理、核心标题、轨迹顺序、危险动作状态和 Pages artifact 边界均先 RED 后 GREEN。

**验证：**

```powershell
pnpm --filter @ai4se/web test
pnpm --filter @ai4se/web build
```

**建议提交：** 原静态规划；双模式设计；规格/实施计划；本地 API；双模式 UI；Pages/评审记录；清空 guiding。

**T11 Task 1 执行证据（2026-07-20）：** 先以锁定 Node 运行 Harness/API/CLI 聚焦测试，因 `local-web-server.js` 不存在且 Provider 限流仍返回通用停机原因得到预期 RED；共享 `runHarnessTask`、回环 Fastify、CLI 复用和 Provider 安全停机分类实现后，3/3 文件、45/45 用例 GREEN，API typecheck/build 与 lint 退出 0。审查又以 4 项 RED 复现“配置错误前读取主密码”和 Fastify 畸形 JSON/body 超限误报 500；修复后 2/2 文件、34/34 用例 GREEN。错误响应只含固定码与中文消息，未回显请求正文、Key 或底层异常。

**T11 Task 2 执行证据（2026-07-20）：** 静态 `App`、本地 `LocalApp` 与客户端缺失时，两个 Web 套件按预期导入失败；实现双入口、固定 mock 页面、受控表单与单次 POST 后 GREEN，并以额外入口顺序 RED 纠正 Vite `transformIndexHtml` 为 `order: "pre"`。审查阶段先用 8 项 RED 复现响应回显 Key 与 Trace schema 过宽，再补递归 Key 拒绝和精确 Action/Trace 校验；对象化枚举回归也先 RED 后改为字符串闭合枚举。最终两个 Web 文件 21/21 用例、完整 typecheck、静态 build（17 modules）、无匹配 artifact 扫描、`local-run` build（19 modules）、lint 与 diff check 均通过。

**T11 Task 3 执行证据（2026-07-20）：** 新增根 `pnpm web:local` 与 `scripts/local-web.mjs`，按 `shell: false` 启动编译 API 和 Web `dev:local`（内部 Vite mode 为 `local-run`）；交互 smoke 确认 `127.0.0.1:4174` 与 `127.0.0.1:5173` 后以 Ctrl+C 关闭，复查无端口监听。CI 保留精确 `unit-test`，新增仅默认分支运行、`needs: ["unit-test"]` 的 `pages`，只发布 `apps/web/dist/.` 到 `public`。初始 RED 为 CI 合约 2 项预期失败（缺少 `pages`、launcher），GREEN 为 3/3 通过。复审发现父进程信号退出码 Important 后，新增 launcher 行为 RED（runner 模块缺失），实现 SIGINT→130、SIGTERM→143、双子进程清理及停止期间忽略 child exit/error 覆盖；聚焦 CI/launcher 为 2/2 文件、5/5 用例 GREEN。使用锁定 Node 24.14.0/pnpm 11.14.0 新鲜运行 `pnpm test`（24/24、258/258）、`pnpm demo`（4/4）、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`git diff --check` 均通过；无真实 Key、学校 API smoke、MR、Pipeline 或 Pages URL 证据。

**T11 全分支最终审查修复（2026-07-20）：** 端口组先新增 API listen/Vite proxy/launcher 非默认端口与严格非法值测试；Web 组先新增“本地服务未启动”和安全 summary/stopReason 结果视图；launcher/静态页组先新增 child error/零退出/非零退出及真实安装命令。合并运行时 4 个文件共观察到 23 项预期 RED，最小修复后 47/47 GREEN；扩展聚焦 API、端口、Web、launcher、静态页和 CI 为 6/6 文件、62/62 用例。实现统一接受十进制 1..65535 并把规范端口传入两子进程；启动器只声明“正在启动”，由服务自身日志提供 ready 证据；Web 仅对 fetch 连接失败显示“本地服务未启动”，非 2xx 不解析正文且仍使用固定通用错误，安全结果视图显示 summary 与每条 stopReason。静态页增加当前仓库真实命令 `pnpm install --frozen-lockfile`。第一次新鲜完整门禁为 25/25 文件、282/282 用例，demo 4/4，lint、typecheck 均退出 0；静态 build 17 modules、artifact 安全扫描无匹配，`local-run` build 19 modules。外部真实 API smoke、push/MR、Pipeline 与 Pages URL 仍未执行。

**T11 真实 Provider smoke 与提示修复（2026-07-21）：** 首次本地页面调用学校 OpenAI-compatible API 时，`qwen-turbo` 在旧提示下返回 `{"action":"respond","content":"..."}`，触发确定性 `parse_error`；临时限额 Key 的模型列表与 Chat Completions 均返回 HTTP 200，证明 Key、endpoint 与模型可用。仅补全四种 Action 的精确 JSON schema，并明确普通问答必须使用 `finish` 后，同一模型直接诊断及 WebUI smoke 均返回 `{"type":"finish","summary":"..."}`。回归测试先观察到 27 项中 1 项预期 RED，随后 Provider/AgentLoop/API 聚焦 3/3 文件、54/54 GREEN；完整门禁为 25/25 文件、282/282 用例，lint、typecheck、build 均通过。负责人在本地页面观察到 `completed`、安全摘要及 `finish · allow · completed` Trace，Key 输入框自动清空；临时 Key 未进入聊天、源码、配置、日志、Trace、Memory、测试输出或 Git，诊断文件已删除并要求负责人在平台撤销。push/MR、Pipeline 与 Pages URL 仍未执行。

## 12. T12：分发、文档与最终交付（已完成，Release 收尾中）

**依赖：** T11 已合入；托管交付从不可用 Pages 调整为助教允许的 GitLab Release。

**Files：**

- Modify `packages/harness/package.json` and build config
- Create package/CLI entry and pack smoke test
- Create `README.md`, `LICENSES.md`, final audit script
- Project owner creates `REFLECTION.md`
- Modify `.gitlab-ci.yml`, `SPEC_PROCESS.md`, `PLAN.md`, `AGENT_LOG.md`

**行为：**

- `pnpm pack` 生成 tarball并在全新临时目录安装、运行离线 smoke。
- CI 运行 test/lint/typecheck/build/demo/secret scan/package build，`unit-test` 保持精确名称。
- README 包含课程要求的全部章节、GitLab Release URL、本地 WebUI 和凭据安全流程。
- 项目负责人本人完成 1500–2500 字 REFLECTION；AI 润色必须标注。
- 扫描当前文件和 Git 历史中的真实凭据；发现疑似真实 Key 时停止并人工处理。

**最终验证：**

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm demo
pnpm pack
```

本节记录 T12 历史基线；当前最终候选已升级为 T17 的 `v2.0.0`，不得沿用旧标签或附件名。

**建议提交：** 规划；打包/smoke；README/许可证；负责人反思；最终审计；清空 guiding。

**最终审计执行证据（2026-07-21）：** 新增 `scripts/final-audit.mjs`、根 `final:audit` 和审计测试；CI `unit-test` 设置 `GIT_DEPTH: "0"`，在 install/test/lint/typecheck/build 后依次运行 demo、Harness build/pack 和 final audit，pack 输出到已忽略的 `.ai4se/harness-pack`，`pages` 仍只发布 `apps/web/dist/.`。初始有效 RED 为新增 10 项失败、既有 283 项通过，原因仅为审计脚本与 CI 命令缺失；最小 GREEN 为 2/2 文件、13/13。审查阶段再逐项 RED→GREEN：四类含 NUL 历史 blob 4/14→14/14、index stage 覆盖 1/15→15/15、恶意诊断路径泄漏→16/16、Pages 新增危险文件 6 项失败→子集 14/14、8 MiB+1 被接受→稳定大小上限 1/1。内存审查再以 48 个唯一 1 MiB 历史 blob 获得有效 RED（旧实现触发 `AUDIT_TEST_BUFFER_BUDGET`），改为 64 OID/16 MiB 有界批次、即时分类并只保留 `oid -> category[]` 后，在 16 MiB V8 heap 与单 Map 20 MiB Buffer 预算下 1/1 GREEN；真实 mode `160000` gitlink 先令旧实现退出 2，跳过 gitlink 且继续扫描 mode `120000` symlink 后 1/1 GREEN。最终历史扫描使用 NUL 安全对象遍历和逐提交有界处理，工作树与 index 均扫描，诊断位置先脱敏后转义，Pages 采用最小 allowlist。真实仓库审计退出 0；聚焦 2/2 文件、28/28，完整测试 27/27 文件、309/309（31.57 秒），演示 4/4，lint、typecheck、build 均退出 0。CI 等价 pack 生成唯一 20,504-byte tarball 后已按明确单文件清理，空子目录非递归删除，`.ai4se` 保留。README、LICENSES、负责人 REFLECTION 和离线包 smoke 由此前提交保留，本任务不修改产品功能、README、REFLECTION 或 guiding。此前负责人 Provider smoke 的非敏感结果为 `https://njusehub.info/v1/chat/completions`、`qwen-turbo`、HTTP 200、`completed`、1 step、`finish`、无 Key 回显。GitLab MR、最新 Pipeline passed 与公开 Pages URL 仍为“待负责人远端操作/核验”，未执行任何远端写操作。

**最终整分支审查修复（2026-07-21）：** 三项 Important 均按 TDD 闭环。slim 镜像 Git 契约先 RED，再仅在 `unit-test` 的 `before_script` 分行执行 `apt-get update`、无推荐依赖安装 Git、清理 apt lists 与 `git --version`；Pages 不额外安装。untracked canary 先返回 0，修复后当前文件范围为 `--cached --others --exclude-standard -z`；物理 symlink 读取 link text 而不跟随目标，当前 Windows 创建 symlink 因 EPERM 条件跳过。192 个小型唯一历史 blob 先触发 Map 条目预算，分类缓存改为固定 64 条 LRU；移除无界 `reportedPaths`，findings 固定上限 256，257 个命中稳定以 `FINDING_LIMIT` 和状态 2 fail-closed，且同类别/路径保留首次扫描提交。聚焦为 32 passed/1 skipped；完整测试 27/27 文件、313 passed/1 skipped（314 total，37.83 秒），lint、typecheck、build、demo、final audit 与 diff check 均退出 0。未修改 README、REFLECTION 或 guiding，未做远端写操作。

## 13. Guide 硬性要求覆盖

| Guide 要求 | 覆盖位置 |
| --- | --- |
| SPEC 至少 5 用户故事、架构、数据、安全、验收、风险 | SPEC 2.2.0 |
| 自研循环与六维最低实现 | T06–T09 |
| 一个重点维度深入 | T09 反馈闭环 |
| mock LLM 确定性测试 | T06–T10 |
| 三项机制演示 | T10 |
| 安全存储、隐藏录入、状态/更新/清除 | T10 |
| 至少 3 个模块与一键测试 | T05 + 根脚本 |
| 分支/worktree/subagent/TDD/双检查/MR | 每个 Txx 统一规则 |
| `unit-test` CI 且最后 passed | T05/T12 |
| 包管理器分发 | T12 npm tarball |
| README 必需章节 | T12 |
| 托管部署入口 | 助教补充说明允许 CLI 项目使用 Release；最终为 GitLab `v1.0.0` Release |
| REFLECTION 本人撰写 | T12 |
| 完整过程记录和多个提交/MR | 全程 AGENT_LOG/PLAN |

## 14. 明确停止线

- 不因“看起来更完整”恢复已删企业级功能。
- 不把环境变量当作唯一安全凭据方案。
- 不把静态 WebUI 描述成在线 Agent。
- 不使用现成 Agent Runner。
- 不在测试、CI 或仓库中使用真实 Key。
- 不为形式重复无新增信息的验证，但课程要求的 TDD、一次双检查、MR 和 Pipeline 不能省略。

## 15. 历史托管交付决议（2026-07-22，已由 v2.0.0 候选取代）

- `main` Pipeline `#313980` 和补充新版 Pages 声明后的 `#313989` 均通过，证明测试与静态 Web 构建正常。
- 学校 GitLab 没有生成 Pages 管理入口、`CI_PAGES_URL` 或可访问公开域名；该能力缺口不能由项目代码修复。
- 根据助教“CLI 项目可提供托管平台 Release 链接”的补充说明，最终交付入口固定为 `https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.0.0`。
- Release 附件固定为 CI 已验证的 `ai4se-harness-0.1.0.tgz`；WebUI 只保留本地运行和静态 mock 源码。
- 本节只记录 v1.0.0 历史状态；T11/T12 执行证据中保留的“Pages 待核验”属于当时事实，当前交付以第 18 节 v2.0.0 候选为准。

## 18. T17：最终离线验收与 v2.0.0 候选

- Trace 升级到 v3，增加会话 ID、脱敏限长的用户/模型摘要与审批结果；保留 v1/v2 兼容读取和迁移，文件上限 1 MiB，摘要上限 512 字符。
- 最终验收矩阵覆盖全新初始化、连续对话、重启 Memory、规则/Skill、Mock MCP、Hook、子 Agent、Sensor、Checkpoint、Trace 脱敏与失败停机；全部使用确定性 mock/stub。
- `@ai4se/harness` 版本为 2.0.0；统一 `pack` 生成 `ai4se-harness-2.0.0.tgz`，自动化在全新目录离线安装、导入并运行 CLI smoke，包内无源码、凭据、Memory 或 Trace。
- Release 标题、说明、附件名、校验说明和助教验收步骤见 `docs/releases/v2.0.0-release-notes.md`；正式入口为 `https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v2.0.0`。
- 本分支不得执行真实 Provider、合并、标签、推送或公开发布。

**最终离线门禁（2026-07-31）：** 严格依次通过统一入口的 `all`、`pack`、包含全新临时目录分发安装/导入/CLI smoke 的 `test` 和末次 `audit`。两次完整测试均为 43/43 文件、409/409 用例；lint、typecheck、Harness/API/Web build、4/4 demo 和两次最终审计均退出 0，Vite 静态构建为 17 modules。包清单只含 `dist`、`bin`、`package.json` 和 `README.md`。本地候选 `ai4se-harness-2.0.0.tgz` 为 55,001 bytes，SHA-256 为 `7A336954FE20B74B8A5F544C215DF2F9C119B1D18A8354BB197E276D0A37A252`；该哈希只记录工作分支本地验收，不得替代最终标签提交的 CI artifact 校验。

**总控验收进展（2026-08-01）：** 已使用本地测试 Key 完成真实 Provider 只读任务，Agent 按 `read_file → finish` 完成，Trace 未包含 Key；临时验收文件已删除。T17 已合入 `dev`，完整门禁为 43/43 文件、409/409 用例，加入临时真实 Provider 用例时为 44/44 文件、410/410 用例。当前只剩合并 `main`、创建并推送 `v2.0.0` 标签、创建 GitLab Release、上传最终 tarball，并从 Release 重新下载做 smoke。

## 16. T15：Skill、MCP 与生命周期 Hooks（已完成）

- `HookManager` 只实现 `SessionStart`、`PreToolUse`、`PostToolUse`、`SessionEnd`，按注入顺序串行执行；Pre 阻断发生在副作用前，职责不替代 Policy/Approval。
- `SkillRegistry` 在工作区约定目录安全发现名片，显式 `load_skill` 后才读取正文；拒绝路径逃逸、符号链接、工作区外真实路径、超大、损坏 UTF-8 与无效元数据。
- `McpRegistry` 和 `MockMcpConnection` 只提供自研适配边界、稳定发现和离线调用；`call_mcp` 固定视为外部信任边界并逐次审批，不连接真实服务。
- `AgentLoop` 每轮提供限长统一能力菜单，Skill/MCP/Hook 接入脱敏上下文、Observation 与 Trace；T13 会话和 T14 Memory 收尾保持兼容。
- TDD 从 9 个缺失边界用例 RED 开始；最终统一 test、lint、typecheck、build、demo 和 audit 均退出 0，demo 4/4，Vite 构建 17 modules。未使用真实 Provider、网络或凭据。

## 17. T16：受限子 Agent、Sensor 与 Checkpoint（已完成）

- `delegate_agent` 由 `SubagentManager` 串行执行；子 Harness 使用独立 `SessionContext`、父级最小工具授权、最大深度、单子步骤上限和 `SharedStepBudget`。父会话只接收脱敏限长摘要。
- `FeedbackSensorSuite` 严格接收 `executable`/`args`，生产装配复用 `CommandTool` 安全边界；成功写入后按 test、lint、typecheck 稳定顺序运行，结果回灌 Observation。
- `WorkspaceCheckpoint` 只快照明确的受限 UTF-8 单文件；工具/Sensor/Post Hook 失败时逐个恢复。新文件只删除本次创建的单个已确认文件，恢复目标变成目录或符号链接时固定失败且不递归清理。
- Trace 记录父子关系、共享预算、Sensor、Checkpoint 和外部副作用不可快照限制；命令/MCP 不会被虚假描述为已回滚。
- TDD 从缺失构造器的 8 项有效 RED 开始；完整离线测试最终覆盖写后通过、Sensor/工具失败恢复、恢复失败、Pre Hook 零快照、工具越权、深度/预算和外部限制。未使用真实 Provider、网络或凭据。
- 收尾审查发现真实 Provider 的系统提示仍只列出 T15 六类 Action；新增契约测试得到 404 项中单一 RED，补入第七类 `delegate_agent` 精确 JSON schema 后恢复 404/404 GREEN。
- 最终统一 `all` 门禁为 42/42 测试文件、404/404 用例；lint、typecheck、Harness/API/Web build、4/4 demo 和 audit 全部退出 0，Vite 构建 17 modules。分支核心提交为 `db82a78`，提示契约修复为 `0c5204a`。
