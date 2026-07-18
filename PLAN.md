# Coding Agent Harness 一周最小交付计划

版本：2.0.0

批准日期：2026-07-18

目标完成日期：2026-07-25
项目负责人：徐黄浩

## 1. 目标

在一周内交付一个可运行、可测试、可演示、可分发的最小 Coding Agent Harness。项目必须由自己的代码实现 agent loop，不依赖现成 agent runner；必须能接入学校提供的 OpenAI 兼容 API，也必须能用 mock LLM 完成全部离线测试。

本版本以课程最低交付为唯一范围。原 1.0.x 中 T13–T20、多用户平台、复杂部署和企业级机制全部取消，不再作为实现承诺。

## 2. 一周硬约束

- 只保留 T05–T12，T12 为最终交付。
- T06–T12 每个 Task 最多 6 个提交，目标 3–5 个；T05 已存在的历史提交不改写。
- 每个 Task 只做一次 Spec 检查、一次质量检查、一次完整门禁；仅 Critical 问题返工。
- 每个功能保留一次可证明的 RED/GREEN；不重复执行无新增信息的复检。
- CI 不使用 Docker、Docker-in-Docker 或 Auto DevOps buildpack。
- 不部署后端；在线 URL 使用 GitLab Pages 静态 WebUI。
- 真实 API Key 不进入 Git、日志、测试、CI 或浏览器。
- `REFLECTION.md` 正文由项目负责人本人撰写，AI 不代写。

## 3. 课程最低要求映射

| 课程要求 | 最小实现 |
| --- | --- |
| 自实现 agent loop | T09 实现单循环、一次纠正和明确停止条件 |
| LLM 抽象 | T06 `LLMProvider` + `ScriptedMockLLM`，T10 真实兼容 Provider |
| 工具 | T07 文件读取、受限写入、受限命令 |
| 记忆 | T08 本地 JSON Memory |
| 治理 | T07 路径边界、危险命令拒绝、需要批准状态 |
| 反馈 | T09 根据退出码形成反馈并驱动一次纠正 |
| 配置 | T08 JSON/环境变量最小配置 |
| 重点机制 | 治理 + 失败反馈闭环 |
| 确定性测试 | mock LLM 单元测试，不联网 |
| 机制演示 | T10 三个可重复 CLI 场景 |
| 真实 AI | T10 本地接入学校 OpenAI 兼容 API |
| CI | T05 `.gitlab-ci.yml` 的 `unit-test` job |
| 在线 WebUI | T11 GitLab Pages 静态演示 |
| 分发 | T12 `pnpm pack` 生成 npm tarball |
| 文档 | 保留 SPEC、PLAN、SPEC_PROCESS、AGENT_LOG、README、REFLECTION |

## 4. 最小架构

```text
apps/web          React 前端；在线只发布静态 mock 演示
apps/api          Fastify 后端；本地装配 Harness 和真实 API Key
packages/harness  Agent 核心；Action、Provider、工具、治理、记忆、反馈和循环
tests             单元、最小集成和机制演示测试
```

依赖方向固定为 `web → api → harness`。Web 不读取 Key，Harness 不依赖 React 或 Fastify。取消空的 `domain`、`shared` 以及原计划中的 `runtime`、`infrastructure` 多包拆分；三个以上职责模块在 `packages/harness/src/` 内按文件划分，不再为每个职责创建 workspace package。

只保留四类 Action：

```ts
type Action =
  | { type: "read_file"; path: string }
  | { type: "write_file"; path: string; content: string }
  | { type: "run_command"; command: string }
  | { type: "finish"; summary: string };
```

核心接口：

```ts
interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}

interface AgentLoop {
  run(task: string): Promise<RunResult>;
}
```

## 5. 明确删除的内容

以下内容不会实现：

- SQLite、migration、并发任务、多人登录、RBAC。
- SSE、审计事件流、复杂审批状态机、Rebaseline、决策版本图。
- 向量数据库、语义检索、跨用户记忆和长期知识库。
- Web 后端、在线真实模型调用、在线 API Key 输入。
- Docker 镜像、Kubernetes、云数据库、HTTPS 运维和备份恢复。
- 多 Provider 凭据轮换、操作系统 Keychain、加密数据库。
- 性能压测、故障注入矩阵、浏览器 e2e 和复杂无障碍审计。
- 原 T13–T20 的独立任务与 Gate。

删减理由：项目负责人明确要求在 2026-07-25 前取得最低课程作业结果，并接受工程深度和扩展能力下降的风险。

## 6. 通用完成门禁

每个 Task 只执行一次：

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

规则：

- 聚焦测试先 RED 后 GREEN。
- Spec 检查只判断是否越界或漏掉当前 Task 接口。
- 质量检查只阻断 Critical；非 Critical 记录后不返工。
- 不允许跳过、删除或弱化已存在测试来获得绿色结果。
- 每个 MR 最终 Pipeline 必须通过。

## 7. T05–T12 执行任务

### T05：工程骨架与最小 GitLab CI

**状态：** 工程骨架已完成；当前只补 CI。

**Files：** Create `.gitlab-ci.yml`, `tests/unit/ci/pipeline-contract.test.ts`, `packages/harness/package.json`, `packages/harness/tsconfig.json`, `packages/harness/src/index.ts`; Remove empty `packages/domain/*`, `packages/shared/*`; Modify root scripts and lockfile.

**产出：** 固定 Node 24/pnpm 11.14；`unit-test` job 执行冻结安装、test、lint、typecheck、build；无 `docker:dind`。

**步骤：**

1. 写 CI 契约测试并观察缺少 `.gitlab-ci.yml` 的 RED。
2. 写最小 `.gitlab-ci.yml`，使契约测试 GREEN。
3. 将空的 domain/shared 合并为单一 `@ai4se/harness` 包并更新锁文件。
4. 运行四个根命令一次。
5. 提交并推送，确认 `unit-test` passed。

**提交：** `ci: 建立最小GitLab质量门禁`。T05 历史提交数超出新上限，作为已发生事实保留，不改写。

### T06：最小决策与分发内核

**Files：** Create `packages/harness/src/action.ts`, `packages/harness/src/llm-provider.ts`, `packages/harness/src/scripted-mock-llm.ts`, `packages/harness/src/dispatcher.ts`, unit tests; Modify `packages/harness/src/index.ts`.

**产出：** 精确 Action union、单次 LLM 调用抽象、脚本化 mock、确定性 Dispatcher。

**测试：** mock 按顺序返回；未知/非法 Action 拒绝；Dispatcher 每次只执行一个 Action。

**步骤：** RED 测试 → 最小类型与实现 → 聚焦 GREEN → 一次双检查和全门禁 → MR。

**提交上限：** 4。

### T07：受限工具与治理

**Files：** Create `packages/harness/src/file-tools.ts`, `packages/harness/src/command-tool.ts`, `packages/harness/src/policy.ts` and tests; Modify Dispatcher registration.

**产出：** 工作区内读写、命令 allowlist、越界路径拒绝、危险命令拒绝、需要人工批准的结构化结果。

**重点机制：** 治理是主要贡献之一；所有规则必须由确定性代码实现，不写成提示词。

**测试：** `../` 逃逸、绝对路径逃逸、危险删除命令零副作用；允许命令正常返回退出码和截断输出。

**提交上限：** 5。

### T08：最小配置与 JSON Memory

**Files：** Create `packages/harness/src/config.ts`, `packages/harness/src/json-memory.ts` and tests; Add ignored local data path.

**产出：** allowlist、步数上限、工作区路径配置；项目约定和最近结果写入单个本地 JSON 文件。

**测试：** 配置缺失快速失败；写入后可读取；损坏 JSON 返回明确错误；Key 永不写入 Memory。

**提交上限：** 4。

### T09：反馈闭环与 Agent Loop

**Files：** Create `packages/harness/src/feedback.ts`, `packages/harness/src/agent-loop.ts` and tests; Modify Harness exports.

**产出：** task → LLM → Action → Policy → Tool → Feedback → 下一步/停止的自实现循环；失败只允许一次纠正，总步数有硬上限。

**测试：** 首次命令失败后 mock 改变下一动作并成功；连续失败停止；危险动作不调用工具；finish 正常结束。

**重点机制：** 失败反馈闭环是主要贡献之二。

**提交上限：** 5。

### T10：CLI、机制演示与真实 AI Provider

**Files：** Create API CLI entry, `packages/harness/src/openai-compatible-provider.ts`, demo fixtures/scripts and tests; Modify package scripts.

**产出：**

- `pnpm demo` 离线展示危险动作拦截、失败后纠正和记忆行为。
- `pnpm agent --task "..."` 可使用真实学校 API。
- 配置 `AI4SE_API_BASE_URL`、`AI4SE_API_KEY`、`AI4SE_MODEL`；输出不得包含 Key。

**测试：** HTTP 使用本地 stub；401/429/5xx 转成结构化错误；日志脱敏；最终由负责人本地执行一次受控真实调用。

**提交上限：** 5。

### T11：静态 WebUI 与 GitLab Pages

**Files：** Modify Web app; Create deterministic demo data; Modify `.gitlab-ci.yml` to add `pages` job; Add UI unit tests.

**产出：** 在线页面展示项目简介、一次运行轨迹、治理拦截、反馈纠正、记忆和运行命令。页面不接触真实 Key、不调用真实 API。

**CI：** `pages` 构建 Web 并发布 `public/`；不使用 Docker service。

**提交上限：** 4。

### T12：分发、文档与最终交付

**Files：** Update `packages/harness` package entry, README, LICENSES, final audit script; Project owner creates `REFLECTION.md`; Update SPEC_PROCESS, PLAN, AGENT_LOG.

**产出：**

- `pnpm pack` 生成可安装 tarball，并在全新目录完成安装/运行 smoke。
- README 包含简介、安装、运行、API Key 配置、分发、目录、安全边界、Pages URL 和限制。
- 最终 CI passed；机制演示可重复；仓库无真实凭据。
- 项目负责人本人完成反思正文。

**提交上限：** 5。

## 8. 七日时间表

| 日期 | 目标 |
| --- | --- |
| 2026-07-18 | T05 CI passed 并合入 |
| 2026-07-19 | T06 |
| 2026-07-20 | T07 |
| 2026-07-21 | T08 |
| 2026-07-22 | T09 |
| 2026-07-23 | T10 |
| 2026-07-24 | T11 |
| 2026-07-25 | T12 与最终提交 |

任务严格串行；不再建立复杂并行 DAG。

## 9. 分支与提交规则

| Task | Branch | 最大提交数 |
| --- | --- | ---: |
| T05 | `chore/t05-project-foundation` | 历史例外 |
| T06 | `feat/t06-minimal-kernel` | 4 |
| T07 | `feat/t07-safe-tools-policy` | 5 |
| T08 | `feat/t08-config-memory` | 4 |
| T09 | `feat/t09-feedback-loop` | 5 |
| T10 | `feat/t10-cli-provider-demo` | 5 |
| T11 | `feat/t11-static-web` | 4 |
| T12 | `docs/t12-final-delivery` | 5 |

每个 Task 一个 MR。取消“guiding 必须单独首尾提交”的额外纪律；需要 guiding 时与计划提交合并，避免无价值提交。

## 10. 最终交付清单

- [ ] `SPEC.md`, `PLAN.md`, `SPEC_PROCESS.md`, `AGENT_LOG.md`
- [ ] 自实现 Harness 源码，包含六个最低维度和重点治理/反馈闭环
- [ ] mock LLM 确定性单元测试与三项机制演示
- [ ] 可选真实学校 API 本地运行入口，Key 无泄露
- [ ] `.gitlab-ci.yml`，包含 `unit-test`，最后一次 Pipeline passed
- [ ] GitLab Pages WebUI URL
- [ ] npm tarball 分发与全新目录 smoke
- [ ] README 必需章节
- [ ] 项目负责人本人撰写的 `REFLECTION.md`
- [ ] 完整 commit/MR 记录，无真实凭据

## 11. 批准与风险

- 项目负责人于 2026-07-18 明确要求：一周内完成、最多到 T12、每个后续 Task 不超过 6 个提交、删除无助于最低课程结果的复检和功能。
- 项目负责人确认最终产品必须能接入学校 API；mock 仅用于测试和静态演示。
- 项目负责人批准 GitLab Pages 静态 WebUI，不部署线上后端。
- 已接受风险：功能广度、企业级安全、可扩展性和线上真实交互明显降低；换取一周内形成完整作业结果。
