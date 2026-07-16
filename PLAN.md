# 决策感知型 Coding Agent Harness 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个自研的决策感知型 Coding Agent Harness，使小型团队的 Coding Agent 在副作用发生前使用当前有效决策、阻断过期快照和冲突，并以离线 mock、审计 Trace、WebUI、CI 和单容器分发证明系统可靠。

**Architecture:** 采用 TypeScript 模块化单体：React WebUI 只通过 HTTP/SSE 白名单 DTO 调用 Fastify；应用服务编排领域、Runtime 与基础设施；领域规则、Agent 主循环、治理、反馈、上下文和状态机均由项目代码实现。生产由单个非 root Linux `amd64` 容器提供 API 与前端静态资源，SQLite 位于 `/data`，被管理仓库挂载到 `/workspace`。

**Tech Stack:** 项目锁定的 Node.js LTS、pnpm、TypeScript strict、Fastify、React、Vite、Zod、SQLite、Drizzle ORM、Vitest、Playwright、Node.js `crypto`、Argon2id、SSE、Docker/OCI、GitLab CI。

## Global Constraints

- 权威需求为 `SPEC.md` 1.0.0；状态为 G1 已通过、G2 待本计划审计、G3 未通过。
- G3 通过前禁止创建本计划描述的源码、测试、依赖、Dockerfile 或 CI 文件。
- 首版只支持一个项目、最多 10 名成员、单应用实例、4 个并发任务；SQLite 开启外键与 WAL。
- Agent 每轮最多一个 `Action`，每任务最多 30 Step；连续验证失败或 Rebaseline 达到 3 次后升级给人。
- 命令默认超时 120 秒，保存输出上限 64 KiB；子进程只接收允许列表环境变量，绝不继承模型 Key。
- 核心测试和三项演示必须使用 `ScriptedMockLLM`，不得访问网络、真实 LLM 或真实 Key。
- 主循环、工具分发、上下文、治理、反馈、配置与 Trace 必须由项目代码实现；禁止使用任何现成 Agent Runner。
- `.env`/密钥读取、工作区外访问、删除、Shell 字符串拼接、联网部署、强推和绕过验证是不可覆盖 `deny`。
- 写入和其他副作用必须绑定有效快照、目标文件摘要与可消费授权；审批有效期 15 分钟且只消费一次。
- 快照使用 UTF-8 规范 JSON 与 SHA-256；时间、数据库返回顺序和运行顺序不得进入指纹。
- 凭据使用 AES-256-GCM；本地主密码以 Argon2id（至少 64 MiB、3 次迭代、并行度 1）派生主密钥。
- 所有提交使用 `类型: 中文解释`；代码注释使用中文；每个 Txx 独立 branch/worktree/MR，目标为 `dev`，禁止 squash。
- 每个实现行为遵循红—绿—重构；每个 Task 先做 Spec 合规评审，再做代码质量评审，Critical 问题全部修复。

---

## 1. 文档控制与 Gate

| 字段 | 值 |
| --- | --- |
| PLAN 版本 | 1.0.0-draft |
| SPEC 基线 | `SPEC.md` 1.0.0，批准时间 2026-07-16 16:53:08 +08:00 |
| 当前批准状态 | T03 编写中；G2 未通过 |
| 实现权限 | 未开放；T04 冷启动与 G3 通过前禁止实现 |
| 计划范围 | T05–T20；T04 只消费本计划并暴露规约缺陷 |
| 目标平台 | Windows 11 x86-64、Linux x86-64；生产 Linux `amd64` |
| 记录平台 | 南京大学 GitLab，MR 与 `.gitlab-ci.yml` |

## 2. 架构边界

调用方向固定为：`apps/web` → `apps/api` → `packages/application` → `packages/domain|runtime` → `packages/infrastructure`。`domain` 不依赖 Fastify、React、Drizzle、文件系统或供应商 SDK；`runtime` 只消费端口接口；`infrastructure` 实现 Repository、Git、进程、加密、LLM 和 Trace 适配器；API 路由和 React 组件不得包含领域状态转换。

## 3. 实现文件地图

### 3.1 根配置

| 路径 | 单一职责 |
| --- | --- |
| `package.json` | 工作区统一脚本：test、lint、typecheck、build、e2e、demo |
| `pnpm-workspace.yaml` | 声明 `apps/*` 与 `packages/*` |
| `pnpm-lock.yaml` | 冻结依赖版本；由 T05 生成 |
| `tsconfig.base.json` | TypeScript strict 与共享编译选项 |
| `eslint.config.js` | 静态规则、安全禁用项和目录边界规则 |
| `vitest.workspace.ts` | unit/integration 项目和覆盖率入口 |
| `.gitignore` | 排除依赖、构建物、数据库、密钥、`.env`、测试产物 |

### 3.2 领域与应用

| 路径 | 单一职责 |
| --- | --- |
| `packages/domain/src/decision/types.ts` | `DecisionRecord`、`DecisionVersion`、`ScopeRule`、`StructuredConstraint` |
| `packages/domain/src/decision/state-machine.ts` | 决策版本合法转换与活动唯一性规则 |
| `packages/domain/src/context/types.ts` | 选择结果、`ContextSnapshot`、diff、Rebaseline 类型 |
| `packages/domain/src/context/selector.ts` | 四级范围确定性选择与理由 |
| `packages/domain/src/context/canonical-json.ts` | Unicode/路径/键/集合规范化与唯一 JSON 表示 |
| `packages/domain/src/context/snapshot-builder.ts` | 代码状态与决策集合的 SHA-256 快照 |
| `packages/domain/src/context/conflict-detector.ts` | 四种操作符的结构化冲突检测 |
| `packages/domain/src/task/types.ts` | `TaskRun`、状态、预算、`AgentStep`、停机原因 |
| `packages/domain/src/task/state-machine.ts` | TaskRun 合法状态转换与终态规则 |
| `packages/domain/src/action/types.ts` | `Action`、`ToolCall`、`ToolResult`、`Observation` |
| `packages/domain/src/governance/types.ts` | `PolicyDecision`、`ApprovalRequest` 与审批状态 |
| `packages/domain/src/feedback/types.ts` | `FeedbackResult` 与五类传感器结果 |
| `packages/domain/src/trace/types.ts` | `TraceEvent`、事件类型与单调序号 |
| `packages/domain/src/credential/types.ts` | `CredentialRef` 与公开凭据状态 |
| `packages/domain/src/errors.ts` | 稳定 `error_code` 联合类型和 `DomainError` |
| `packages/domain/src/ports.ts` | Repository、Clock、IdGenerator、Hasher 等领域端口 |
| `packages/application/src/services/decision-service.ts` | 决策创建、版本创建和事务激活用例 |
| `packages/application/src/services/context-service.ts` | 选择、冲突、代码状态与快照用例 |
| `packages/application/src/services/task-service.ts` | 创建、调度、取消、恢复中断任务 |
| `packages/application/src/services/approval-service.ts` | 审批创建、决定、绑定校验和消费 |
| `packages/application/src/services/credential-service.ts` | 隐藏录入后的保存、状态、更新和清除 |

### 3.3 Agent Runtime 与基础设施

| 路径 | 单一职责 |
| --- | --- |
| `packages/runtime/src/llm/types.ts` | 单次 `LLMProvider` 调用接口与供应商错误 |
| `packages/runtime/src/llm/scripted-mock.ts` | 可重复脚本响应与调用记录 |
| `packages/runtime/src/action/parser.ts` | 严格 Zod Action 解析 |
| `packages/runtime/src/tools/registry.ts` | 工具名称、Schema 与处理器注册 |
| `packages/runtime/src/tools/dispatcher.ts` | 查找、校验、超时和结构化 ToolResult |
| `packages/runtime/src/governance/policy-engine.ts` | 确定性 `allow/ask/deny` 规则 |
| `packages/runtime/src/feedback/engine.ts` | 传感器执行、分类、Observation 回灌 |
| `packages/runtime/src/agent/agent-runtime.ts` | 自研主循环、完成门、预算与停机 |
| `packages/runtime/src/agent/context-builder.ts` | 组织快照、历史、反馈与 Action Schema |
| `packages/runtime/src/config/schema.ts` | YAML 配置 Zod Schema 与安全默认值 |
| `packages/infrastructure/src/db/schema.ts` | Drizzle 表、索引、外键和唯一约束 |
| `packages/infrastructure/src/db/repositories/*.ts` | Repository 的 SQLite 事务实现 |
| `packages/infrastructure/src/git/code-state-reader.ts` | Git commit、dirty 摘要和目标文件哈希 |
| `packages/infrastructure/src/tools/path-guard.ts` | realpath、symlink/junction 和敏感路径围栏 |
| `packages/infrastructure/src/tools/file-tools.ts` | compare-and-set 受限读写 |
| `packages/infrastructure/src/tools/process-runner.ts` | 参数数组、最小环境、超时、输出限制 |
| `packages/infrastructure/src/feedback/command-sensor.ts` | test/lint/typecheck/build 命令传感器 |
| `packages/infrastructure/src/llm/openai-compatible.ts` | 单次 Chat Completions HTTP 适配器 |
| `packages/infrastructure/src/security/redactor.ts` | 全通道字段级脱敏器 |
| `packages/infrastructure/src/security/credential-store.ts` | Argon2id/AES-GCM、轮换和短时解密 |
| `packages/infrastructure/src/trace/sqlite-trace-store.ts` | 事务追加、查询、游标与 30 天清理 |

### 3.4 API、WebUI、测试、演示与部署

| 路径 | 单一职责 |
| --- | --- |
| `packages/shared/src/dto/*.ts` | HTTP/SSE 白名单 DTO 与 Zod Schema |
| `apps/api/src/app.ts` | Fastify 装配、插件注册和静态资源 |
| `apps/api/src/routes/*.ts` | 认证/校验后调用应用服务；无领域逻辑 |
| `apps/api/src/sse/task-events.ts` | 按持久化序号推送和重连补读 |
| `apps/web/src/pages/*.tsx` | 登录、任务、决策、快照、审批、Trace、凭据页面 |
| `apps/web/src/api/client.ts` | HTTP/SSE DTO 客户端，不缓存凭据 |
| `tests/unit/**/*.test.ts` | 纯领域、Runtime 和安全边界单元测试 |
| `tests/integration/**/*.test.ts` | 临时 SQLite、Fastify inject、Git/进程集成测试 |
| `tests/e2e/**/*.spec.ts` | Playwright mock Provider 用户流程 |
| `tests/test-support/**/*.ts` | 固定 Clock/ID/Hasher、临时仓库、fake Key、mock 工具 |
| `demos/mechanisms/*.test.ts` | DEMO-01–03 自动断言 |
| `scripts/run-mechanism-demos.mjs` | 单命令运行三项演示并传递退出码 |
| `deploy/Dockerfile` | Linux `amd64` 非 root 单容器多阶段构建 |
| `deploy/entrypoint.sh` | 迁移、健康前置和应用启动，不打印 Secret |
| `.gitlab-ci.yml` | 离线单测、质量、安全、集成、e2e、镜像任务 |
| `README.md` | 价值、架构、安装、演示、凭据、分发和限制 |
| `REFLECTION.md` | 项目负责人本人撰写的 1500–2500 字反思 |

## 4. 稳定接口合同

```ts
type UUID = string;
type Sha256 = string;
type PathId = string;

interface LLMProvider {
  complete(input: LLMRequest, signal: AbortSignal): Promise<LLMResponse>;
}
interface ToolExecutor {
  execute(call: ToolCall, limits: ToolLimits, signal: AbortSignal): Promise<ToolResult>;
}
interface FeedbackSensor {
  readonly name: string;
  run(input: SensorInput, signal: AbortSignal): Promise<FeedbackResult>;
}
interface Clock { now(): Date; }
interface IdGenerator { next(): UUID; }
interface Hasher { sha256(value: Uint8Array): Sha256; }
```

跨任务稳定实体名称为：`DecisionRecord`、`DecisionVersion`、`ScopeRule`、`ContextSnapshot`、`TaskRun`、`AgentStep`、`Action`、`ToolCall`、`ToolResult`、`Observation`、`PolicyDecision`、`FeedbackResult`、`ApprovalRequest`、`TraceEvent`、`CredentialRef`。时间由 `Clock` 注入，ID 由 `IdGenerator` 注入，哈希由 `Hasher` 注入；测试不得读取真实当前时间或随机顺序。

## 5. 状态与错误归属

- 决策状态只在 `decision/state-machine.ts` 定义：`proposed → active → superseded`。
- 任务状态只在 `task/state-machine.ts` 定义：`queued|running|waiting_approval|rebaseline_required|completed|failed|cancelled|interrupted`。
- Action 合法路径：`proposed → authorized → executed|failed`，或 `proposed|authorized → rejected|invalidated`。
- 审批状态：`pending → approved|denied|expired`，`approved → consumed|expired`。
- 反馈分类：`PASS|FAIL|CONFLICT|ENV_ERROR|TIMEOUT`；错误码使用 SPEC 中名称，新增错误码必须先修订 `domain/errors.ts`、共享 DTO 和需求追踪。
- `redactor.ts` 是日志、Trace、Observation、API、SSE、导出和错误的唯一脱敏入口；各模块不得自行维护不同正则。

## 6. 统一任务模板

每个 Txx 执行时必须复制以下检查项到其 `guiding.md`，并把精确命令输出写入 `AGENT_LOG.md`：

1. **目标/依赖**：只加载 SPEC 对应章节、当前 Task、前序接口和相关文件。
2. **Files**：逐项列出 Create、Modify、Test 精确路径。
3. **Interfaces**：列出 Consumes/Produces 的精确签名和错误语义。
4. **RED**：先写给定测试代码，运行给定命令，确认因目标行为缺失而失败。
5. **GREEN**：只写足以通过当前测试的实现，运行同一命令并记录 PASS。
6. **REFACTOR**：消除重复、收紧边界，再运行当前包与全量回归。
7. **Review**：先请求 Spec 合规评审，再请求代码质量评审；修复全部 Critical。
8. **Commit/MR**：精确 `git add`，中文提交；Pipeline 通过；MR 记录 task、subagent、人工修改、测试和风险。

通用验证命令（T05 建立后）：

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

预期：命令退出码均为 0；任何跳过、删除或弱化失败测试均视为未完成。

## 7. 需求追踪骨架

| 需求 | 主要实现 | 验证任务 |
| --- | --- | --- |
| `REQ-001` | T11 | T11、T20 |
| `REQ-002` | T11 | T11、T14 |
| `REQ-003` | T11 | T14、T15 |
| `REQ-004` | T11 | T14、T15 |
| `REQ-005` | T13 | T15 |
| `REQ-006` | T14 | T15 |
| `REQ-007` | T09 | T14、T15 |
| `REQ-008` | T09 | T09、T15 |
| `REQ-009` | T13 | T13、T15 |
| `REQ-010` | T08 | T08、T18 |
| `REQ-011` | T10 | T15 |
| `REQ-012` | T13 | T13、T15 |
| `REQ-013` | T12 | T16、T18 |
| `REQ-014` | T12 | T17、T18 |
| `REQ-015` | T17 | T17、T20 |
| `REQ-016` | T13 | T06–T14 评审、T20 |
| `REQ-017` | T15 | T18 |
| `REQ-018` | T15 | T18 |
| `REQ-019` | T15 | T18 |
| `REQ-020` | T14 | T20 |
| `REQ-021` | T16 | T16、T20 |
| `REQ-022` | T18 | T18、T20 |
| `REQ-023` | T19 | T19、T20 |
| `REQ-024` | T19 | T20 |
| `REQ-025` | T20 | T20 |

## 8. T05–T20 原子任务

后续章节逐项定义 T05–T20。未在当前 Txx 章节列出的行为不得由执行者顺手加入；发现缺口时停止并按变更纪律修订 SPEC/PLAN。

## 9. 执行证据台账

| Txx | Branch | Commit(s) | MR | Pipeline | Spec Review | Quality Review | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T05 | `chore/t05-project-foundation` | — | — | — | — | — | 未开始 |
| T06 | `feat/t06-mock-llm` | — | — | — | — | — | 未开始 |
| T07 | `feat/t07-tool-dispatch` | — | — | — | — | — | 未开始 |
| T08 | `feat/t08-builtin-tools` | — | — | — | — | — | 未开始 |
| T09 | `feat/t09-governance` | — | — | — | — | — | 未开始 |
| T10 | `feat/t10-feedback-loop` | — | — | — | — | — | 未开始 |
| T11 | `feat/t11-memory-context` | — | — | — | — | — | 未开始 |
| T12 | `feat/t12-config-tracing` | — | — | — | — | — | 未开始 |
| T13 | `feat/t13-agent-loop` | — | — | — | — | — | 未开始 |
| T14 | `feat/t14-main-contribution` | — | — | — | — | — | 未开始 |
| T15 | `test/t15-mechanism-demos` | — | — | — | — | — | 未开始 |
| T16 | `feat/t16-webui` | — | — | — | — | — | 未开始 |
| T17 | `feat/t17-credential-security` | — | — | — | — | — | 未开始 |
| T18 | `ci/t18-gitlab-pipeline` | — | — | — | — | — | 未开始 |
| T19 | `chore/t19-distribution-deploy` | — | — | — | — | — | 未开始 |
| T20 | `docs/t20-final-delivery` | — | — | — | — | — | 未开始 |

## 10. T04 冷启动使用说明

T04 的陌生智能体只能获得 `SPEC.md` 与本文件；不得获得历史聊天、memory 或口头补充。它选择 1–2 个计划 Task 试做，遇到类型、路径、行为或验证不确定时立即暂停提问，不得猜测；试做仅用于暴露规约缺陷，G3 通过前不得进入正式实现。
