# Coding Agent Harness 课程最小实现计划

> **For agentic workers:** 按 T06–T12 串行执行；每个 Task 使用独立 branch/worktree、一次新鲜 subagent、TDD、Spec 检查、质量检查和 MR Pipeline。步骤用 `guiding.md` 细化，不扩展本计划范围。

**版本：** 2.1.0

**SPEC 基线：** `SPEC.md` 2.0.0

**目标日期：** 2026-07-25

**当前状态：** G1–G3 已通过，T05–T08 已合入 `dev`；T09 待创建独立功能分支

## 1. 目标与最小边界

在 T05 的可运行骨架上，用 T06–T12 交付满足原始课程要求的最小 Coding Agent Harness：自研循环、六维最低实现、反馈重点维度、mock 测试、三项演示、安全凭据、真实学校 API 本地入口、GitLab Pages、npm tarball、README、过程证据和本人反思。

不实现数据库、多用户、SSE、Rebaseline、复杂审批、Docker 或线上后端。

## 2. 固定架构与接口

```text
apps/api → packages/harness
apps/web（独立静态演示）
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

命令不得使用 Shell 字符串；Web 不依赖本地 API；真实 Key 只在本地 CLI 的安全凭据模块中使用。

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
| T09 | 反馈重点维度与自研 Agent Loop | `feat/t09-feedback-loop` | 未开始 | 6 |
| T10 | 安全凭据、真实 Provider、CLI 与三演示 | `feat/t10-cli-provider-demo` | 未开始 | 6 |
| T11 | 静态 WebUI 与 GitLab Pages | `feat/t11-static-web` | 未开始 | 5 |
| T12 | npm 分发、README、反思与最终审计 | `docs/t12-final-delivery` | 未开始 | 6 |

## 5. T05：工程骨架与最小 CI（已完成）

**产物：** Node 24/pnpm 11 workspace、API/Web/Harness/tests、健康测试、`unit-test` GitLab job。

**主要提交：** `fbd796d`、`3d70dd4`、`62b95da`、`2e902e0`。

**合并：** MR !6 → `dev`，merge commit `f014b42`。

**待最终审计：** 在 T12 记录 MR !6 的最终 Pipeline URL/status；无法获取时如实标记证据缺口，不伪造。

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

**建议提交：** 规划；凭据；Provider/CLI；三演示；评审/记录；清空 guiding。

## 11. T11：静态 WebUI 与 GitLab Pages

**依赖：** T10 的脱敏 mock Trace 格式。

**Files：**

- Modify `apps/web/src/main.tsx`, `apps/web/vite.config.ts`, `apps/web/package.json`
- Create `apps/web/src/demo-data.ts`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`
- Create Web unit tests
- Modify `.gitlab-ci.yml` 增加 `pages` job

**行为：** 展示价值、架构、固定运行轨迹、治理拦截、失败修正、Memory 摘要和命令；不连接 API、不读取 Key。页面提供清晰状态、键盘可操作基础交互和真实 Pages URL。

**TDD：** 核心标题、轨迹顺序、危险动作状态和零 Key 文本先 RED 后 GREEN。

**验证：**

```powershell
pnpm --filter @ai4se/web test
pnpm --filter @ai4se/web build
```

**建议提交：** 规划；UI RED；静态 UI；Pages/评审记录；清空 guiding。

## 12. T12：分发、文档与最终交付

**依赖：** T11 合入，Pages 可访问。

**Files：**

- Modify `packages/harness/package.json` and build config
- Create package/CLI entry and pack smoke test
- Create `README.md`, `LICENSES.md`, final audit script
- Project owner creates `REFLECTION.md`
- Modify `.gitlab-ci.yml`, `SPEC_PROCESS.md`, `PLAN.md`, `AGENT_LOG.md`

**行为：**

- `pnpm pack` 生成 tarball并在全新临时目录安装、运行离线 smoke。
- CI 运行 test/lint/typecheck/build/demo/secret scan/package build，`unit-test` 保持精确名称。
- README 包含课程要求的全部章节、Pages URL 和凭据安全流程。
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

还需确认：npm tarball smoke、GitLab Pages 可访问、最终 `dev → main` MR、`main` 最新 Pipeline passed。

**建议提交：** 规划；打包/smoke；README/许可证；负责人反思；最终审计；清空 guiding。

## 13. Guide 硬性要求覆盖

| Guide 要求 | 覆盖位置 |
| --- | --- |
| SPEC 至少 5 用户故事、架构、数据、安全、验收、风险 | SPEC 2.0.0 |
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
| 在线 WebUI URL | T11 GitLab Pages |
| REFLECTION 本人撰写 | T12 |
| 完整过程记录和多个提交/MR | 全程 AGENT_LOG/PLAN |

## 14. 明确停止线

- 不因“看起来更完整”恢复已删企业级功能。
- 不把环境变量当作唯一安全凭据方案。
- 不把静态 WebUI 描述成在线 Agent。
- 不使用现成 Agent Runner。
- 不在测试、CI 或仓库中使用真实 Key。
- 不为形式重复无新增信息的验证，但课程要求的 TDD、一次双检查、MR 和 Pipeline 不能省略。
