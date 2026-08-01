# Coding Agent Harness 课程最小交付规约

> **2026-07-31 T17 候选：** 路线 B 已完成 Trace v3、最终离线验收矩阵与 `@ai4se/harness` 2.0.0 全新目录 tarball smoke。真实 Provider 最终验收、合并、标签、推送与公开 Release 仍由总控完成。

## 0. 文档控制

| 字段 | 值 |
| --- | --- |
| 文档版本 | 2.7.0 |
| 批准日期 | 2026-07-31 |
| 项目负责人 | 徐黄浩 |
| 权威需求来源 | 本文件；`guide/AI4SE_Final_Project_通用要求.md` 与 `guide/AI4SE_Final_Project_A_Coding_Agent_Harness.md` 是不可删减的上位要求 |
| 当前 Gate | v2.0.0 离线候选已准备；等待总控真实 Provider 验收与公开发布 |
| 实现范围 | T05–T17；T17 只补完整 Trace、离线验收、分发与 Release 材料 |

本版本取代 SPEC 1.0.0 的实现承诺。旧版本保留为 Git 历史和过程证据，不再要求实现数据库、多用户平台、复杂决策版本、SSE、Docker 或线上后端。任何删减都不得违反上述两份课程原始要求。

## 1. 问题、用户与价值

### 1.1 问题陈述

现成 Coding Agent 能生成代码，但危险动作拦截、工具边界、客观反馈、跨会话记忆和停机条件常依赖宿主框架或提示词。本项目实现一个精炼的 Coding Agent Harness，用自己的 TypeScript 代码把单次 LLM 调用组装成可测试、受约束、能根据失败修正一次的 coding 循环。

### 1.2 目标用户

- 主要用户：希望理解 Agent 工程机制的课程学生或个人开发者。
- 评审用户：需要通过代码、测试、演示和过程记录判断机制是否真实实现的教师或助教。

### 1.3 30 秒价值陈述

给它一个小型编码任务，它会调用可替换 LLM 选择动作，在工作区和命令白名单内执行，危险动作由确定性代码拦截，测试失败会作为反馈驱动一次修正；全部核心行为都能移除真实 LLM 后用 mock 单测复现。

## 2. 用户故事

1. 作为开发者，我希望用一个任务字符串启动 Agent，使它能在明确步数上限内完成或给出结构化停机原因。
2. 作为开发者，我希望 Agent 能读取、受控写入工作区文件并运行允许的测试命令，以便真实作用于代码。
3. 作为安全负责人，我希望越界路径、危险命令和未批准副作用在执行前被代码拦截，以便工具调用次数保持为零。
4. 作为开发者，我希望失败退出码和摘要回灌给 Agent，使 mock LLM 能选择不同的下一动作并成功结束。
5. 作为重复使用者，我希望项目约定和最近结果写入本地记忆，并只把相关条目加入上下文。
6. 作为真实模型使用者，我希望安全录入、查看状态、更新和清除学校 OpenAI-compatible API Key；本地 WebUI 可为单次运行临时接收 Key，但明文不得进入源码、Git、日志、Trace、Memory、URL 或浏览器持久化存储。
7. 作为评审者，我希望一条命令运行全部离线测试和三项机制演示，并能从 README 理解静态 mock 运行轨迹。
8. 作为新用户，我希望从 GitLab `v2.0.0` Release 下载 npm tarball，在全新目录安装并按照 README 完成配置与运行。
9. 作为 CLI 用户，我希望后一题能引用前文，并能用 `/new` 重置短期对话、用 `/model` 查看或保存模型；超出预算时仍保留安全约束、规则、目标、摘要和近期消息。
10. 作为复杂任务使用者，我希望父 Agent 能串行委派受限子 Agent，并在写入后自动验证；若工具或 Sensor 失败，只恢复明确快照的单文件且不伪称回滚外部副作用。

这些故事可独立验收，均有明确用户、价值和可观察结果。

## 3. 范围与非目标

### 3.1 必做范围

- 自研 Agent 主循环，不使用现成 Agent Runner。
- 六个 Harness 维度的最低实现：决策封装、工具、记忆、治理、反馈、配置。
- 可注入 `ScriptedMockLLM` 与 OpenAI-compatible 单次补全 Provider。
- 受限文件读写、受限命令、策略拦截和最小人工批准状态。
- JSON 记忆、结构化 Trace、日志脱敏和明确停机原因。
- 重点维度：反馈闭环；实现失败分类、反馈回灌、一次动作修正和连续失败停机。
- 三项离线机制演示、GitLab CI、本地 WebUI/静态 mock、GitLab Release npm tarball 分发。
- 安全凭据录入、状态、更新、清除，以及 README、过程文档和学生本人反思。

### 3.2 明确不做

- SQLite、migration、向量数据库和复杂检索。
- 多用户登录、RBAC、团队协作和并发任务。
- 决策版本图、快照指纹、Rebaseline 和复杂审批状态机。
- SSE、在线任务控制台和线上真实模型调用。
- Docker、Kubernetes、云数据库、线上后端和运维体系。
- 多 Provider、凭据轮换、性能压测、故障矩阵和浏览器 e2e。

静态 WebUI 只展示固定的 mock 运行轨迹，不接收 Key、不执行真实 Agent，也不作为公网服务。本地显式启动的 WebUI 可把单次填写的 Provider 配置和 Key 发送给仅监听 `127.0.0.1` 的 Fastify 服务，调用完整 Harness；该入口不部署线上后端，也不替代 CLI 加密凭据流程。

## 4. 领域与机制设计

### 4.1 决策封装

`AgentLoop` 组织任务、相关记忆、历史 Observation 和当前步数，调用一次 `LLMProvider.complete()`，再由严格解析器生成一个 `Action`。Provider 只负责单次补全，不拥有循环、工具、治理或重试策略。

```ts
interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}
```

### 4.2 Action 与工具

```ts
type Action =
  | { type: "read_file"; path: string }
  | { type: "write_file"; path: string; content: string }
  | { type: "run_command"; executable: string; args: readonly string[] }
  | { type: "load_skill"; name: string }
  | { type: "call_mcp"; server: string; tool: string; arguments: Readonly<Record<string, unknown>> }
  | { type: "delegate_agent"; task: string; allowedTools: readonly string[] }
  | { type: "finish"; summary: string };
```

- 文件路径必须是工作区内相对路径，拒绝绝对路径、`..` 逃逸和敏感文件。
- 命令使用可执行文件与参数数组，不经过 Shell 字符串拼接。
- 默认命令允许列表只包含项目配置批准的测试/检查入口。
- 工具返回结构化 `ToolResult`，包含状态、退出码、截断输出和错误码。

### 4.3 记忆

本地 JSON Memory 只保存项目约定和最近运行结果摘要。条目包含 `id`、`kind`、`tags`、`content`、`updatedAt`；按任务关键词和标签选择相关条目，不全量注入。API Key、完整命令输出和文件正文不得写入记忆。支持读取、写入、更新和清除。

### 4.4 治理护栏

确定性 `PolicyEngine` 返回 `allow | ask | deny`：

- `deny`：路径逃逸、敏感文件、删除类命令、Shell 启动器、白名单外程序。
- `ask`：工作区文件写入和其他配置为需批准的副作用。
- 外部 MCP 调用固定为 `ask`；本地 PathGuard 与命令白名单不延伸到远端实现。
- `allow`：安全读取和已允许的只读验证命令。

`ask` 必须暂停并生成结构化批准请求；没有批准时不得调用工具。最小版本只支持当前 CLI 会话中的一次批准，不实现持久化审批平台。

### 4.5 反馈闭环（主要贡献）

传感器把测试、lint、类型检查或构建结果归类为 `pass | fail | timeout | environment_error`，并生成短 Observation。失败 Observation 进入下一轮上下文，驱动 mock LLM 选择不同动作。默认只允许一次失败修正，总步数达到上限或再次失败时停止并升级给人。

主要贡献的深度由三个确定性行为体现：失败类型稳定、失败证据被回灌、修正次数与停机条件由代码强制。

### 4.6 配置

JSON 配置通过运行时 schema 校验，至少包含工作区路径、允许命令、最大步数、命令超时、输出上限、记忆路径和 Provider 配置。未知字段或越界值快速失败。API Key 不进入普通配置文件。

### 4.7 为什么这些是代码机制

工具分发、路径检查、策略、反馈分类、记忆读写和停机判断均由项目源码实现。替换真实 Provider 为 `ScriptedMockLLM` 后，全部机制仍可用单元测试验证；Prompt、配置和 Skill 只作为输入内容，不计为 Harness 内核。

### 4.8 T13 会话上下文与规则

- `SessionContext` 按顺序保存 user、assistant、Action 和 Observation；Trace 只承担审计，不充当模型历史。
- `/new` 仅重置当前进程内短期上下文；`/model` 查看当前模型，或校验后原子保存新模型名称。
- 启动装配按浅到深的作用域祖先链加载 `CLAUDE.md`、`AGENTS.md`；同层后加载的 `AGENTS.md` 优先。规则带来源和作用域，且不能覆盖路径围栏、Policy、Approval 或凭据隔离。
- `contextBudgetChars` 达到阈值后执行确定性压缩，保留系统约束、规则、当前目标、脱敏摘要和近期消息；摘要省略写入正文、命令参数及大段工具输出。
- T13 不写入长期 Memory，不实现 `/memory`、Skill、MCP、Hooks、子 Agent、传感器或 Checkpoint。

### 4.9 T14 长期 Memory 生命周期

- 每项任务在首次 Provider 调用前按当前目标检索一次相关 Memory，后续步骤复用同一检索结果；无关条目不注入。
- 只有已完成任务的限长摘要生成 `recent_result`；只有用户使用明确“记住约定：…”前缀表达的稳定约定生成 `convention`，不从普通对话推断个人信息。
- 候选统一拒绝凭据和个人标识，进行脱敏、320 字符限长、稳定标签提取、确定性 ID 去重与排序；不复制完整消息、Action、Observation、命令输出或文件正文。
- 候选在会话内暂存，由 `/new`、`/exit`、输入结束和可控异常边界调用最小明确收尾；批量合并使用单次原子替换，不引入通用 Hook。
- 新进程从当前工作区 `.ai4se/memory.json` 恢复检索；`/memory` 只显示安全摘要，`/memory clear` 必须在用户确认后执行。`/new` 先固化候选并只重置短期上下文。

### 4.10 T15 Skill、MCP 与生命周期 Hooks

- Skill 从工作区 `.ai4se/skills/<name>/SKILL.md` 发现；平时只提供稳定排序、限长的名称和简介，显式 `load_skill` 后才读取并注入完整指令。同一会话不重复注入。
- Skill 名称、真实路径、符号链接、文件大小、UTF-8 与严格 frontmatter 均由代码校验；失败返回固定脱敏错误。Skill 指令低于系统安全约束、Policy、Approval 和工作区规则。
- MCP 仅定义自研连接/工具/请求/结果接口与离线 mock；工具名片标注 `external`。`call_mcp` 通过统一 Policy、逐次 Approval、Pre/Post Hook 和 Dispatcher，不实现生产协议客户端或真实外部连接。
- Hook 固定为 `SessionStart`、`PreToolUse`、`PostToolUse`、`SessionEnd`，按注册顺序串行执行。Pre 可在副作用前阻断；Post 只接收脱敏结果；异常统一映射为固定错误。
- Hook 事件使用会话 ID 写入 Trace 的独立有序事件列表；`SessionEnd` 在 `/new`、`/exit`、EOF 和可控异常边界至多执行一次，并先于 Memory consolidate。

### 4.11 T16 受限子 Agent、Sensor 与 Checkpoint

- `delegate_agent` 只串行启动子 Harness；子 Agent 使用新建的 `SessionContext`，只接收任务、规则/Skill 名片和父级允许的最小工具集，不复用父会话历史。
- 深度、每个子 Agent 步骤数和父子共享总步骤预算由代码强制；耗尽时确定性停止。子 Agent 只返回脱敏、限长摘要，不回灌完整内部消息或大段输出。
- Sensor 配置只包含稳定名称、`executable`、`args` 和可选启用状态，复用既有 `CommandTool` 的无 Shell、白名单、超时与输出边界；只有成功的 `write_file` 自动触发。
- `WorkspaceCheckpoint` 只快照明确写入目标的受限 UTF-8 单文件。目录、符号链接、敏感路径、凭据正文和超限文件均拒绝；失败时逐个恢复原文件，或只删除本次创建的一个已确认普通文件。
- 命令与 MCP 的任意外部副作用不在教学级 Checkpoint 能力内；Trace 明确记录不可快照限制，不声称已经回滚。
- Trace 条目补充父子会话关系、共享预算、Sensor 分类、Checkpoint 创建/恢复和外部回滚限制，全部经过统一 Redactor。

## 5. 功能规约

### 5.1 Mock LLM 与动作解析

- 输入：任务、记忆摘要和 Observation 历史。
- 行为：脚本化 mock 按顺序返回结果；解析器只接受六类 Action 和精确字段。
- 输出：Action 或结构化解析错误。
- 边界：脚本耗尽、未知动作、缺失字段和多余字段均失败；测试不联网。

### 5.2 文件与命令工具

- 输入：已通过 Policy 的 Action。
- 行为：解析真实路径后限制在 workspace；命令使用 `spawn(executable,args)`，设置超时和输出上限。
- 输出：成功内容/退出码，或稳定错误码。
- 边界：拒绝 `.env`、凭据文件、路径逃逸、Shell 字符串和危险删除；拒绝发生在副作用前。

### 5.3 Memory 与配置

- 输入：合法配置、Memory 查询或更新。
- 行为：schema 校验、批量候选原子写入单个 JSON 文件、按任务标签与关键词筛选、会话末固化和重启恢复。
- 输出：相关 MemoryItem 或明确错误。
- 边界：损坏 JSON 不静默覆盖；凭据、个人标识、完整对话和大段正文拒绝写入；重复固化不增加重复项；缺少配置快速失败。

### 5.4 Agent Loop 与反馈

- 输入：任务、Provider、工具、Policy、Memory、配置。
- 行为：组装上下文 → 调 LLM → 解析 → 策略 → 工具 → 反馈 → 下一轮/结束。
- 输出：`completed | blocked | failed | max_steps` 及 Trace。
- 边界：每轮最多一个 Action；危险动作零调用；失败最多自动修正一次。

### 5.5 真实 Provider、CLI 与凭据

- `OpenAICompatibleProvider` 只调用一次兼容 Chat Completions API，不包含 Agent Runner。
- CLI 支持任务运行、凭据初始化、状态、更新和清除。
- 安全存储使用带主密码的加密文件：隐藏输入主密码，以 `scrypt` 派生 256 位密钥，使用随机 salt、随机 12-byte nonce 和 AES-256-GCM；文件只保存 salt、nonce、tag 和密文。
- 主密码和 API Key 不写入命令参数、日志、Trace、Memory 或 Git；状态命令只显示 configured/unconfigured。
- `.env` 仅作为明确标注风险的可选来源，不是默认安全存储。

### 5.6 三项机制演示

单个 `pnpm demo` 使用 mock LLM 自动断言：

1. 危险删除或敏感文件动作被治理护栏拦截，工具调用为零。
2. 第一次验证失败被回灌，mock LLM 改变下一动作后成功。
3. 反馈维度的确定性停机：第二次失败后停止，不发生第三次工具调用。

演示不联网、不使用真实 Key，失败时进程退出非零。

### 5.7 本地 WebUI 与静态 mock

静态构建展示项目价值、最小架构、固定 mock Trace、治理拦截、失败修正、Memory 摘要、安装和演示命令。该构建不依赖 API 服务，不读取 Key，不包含真实运行表单，也不声称能在线执行真实 Agent。学校 GitLab Pages 未提供可用公网地址，静态构建仅作为源码和本地构建产物保留。

本地构建模式显示任务、OpenAI-compatible endpoint、模型名和 password 类型 Key 输入，经相对 `/api/runs` 请求交给回环 Fastify 服务。Key 只在一次运行的浏览器与 Node 进程内存中短暂存在；成功或失败后清空前端状态，后端不落盘、不回显、不记录。服务读取本地 `.ai4se/config.json` 的工作区与工具限制，请求不能覆盖命令白名单、超时、输出或步数边界；`ask` 动作默认拒绝并提示改用 CLI 获取人工批准。

### 5.8 分发与文档

- `pnpm pack` 生成 `ai4se-harness-2.0.0.tgz` Harness/CLI npm tarball。
- 在全新临时目录安装 tarball并运行离线 smoke。
- README 必须包含项目简介、架构/主要贡献、安装、运行、测试、三项演示、本地 WebUI、GitLab Release URL、凭据录入/状态/更新/清除、目录、安全边界、分发和已知限制、第三方许可证。
- `REFLECTION.md` 1500–2500 字，由项目负责人本人撰写；AI 仅可润色并标注。

### 5.9 T16 扩展闭环

- 输入：委派动作、结构化 Sensor 配置和明确单文件写入目标。
- 行为：父 Agent 串行委派 → 子上下文受限执行 → 摘要回灌；写前快照 → 写入 → Sensor → 成功提交或失败恢复。
- 输出：脱敏 Observation，以及包含父子、预算、Sensor、Checkpoint 和回滚限制的 Trace 细节。
- 边界：不并行、不使用 worktree/操作系统快照；不递归复制或删除工作区；不回滚未声明的外部副作用。

## 6. 架构与数据流

```text
apps/api (本地 CLI / 仅回环 Fastify 真实运行入口)
        ↓
packages/harness (Action、Provider、工具、治理、记忆、反馈、循环)

apps/web (静态 mock；本地显式模式连接 apps/api)
tests (跨模块单测、集成测试和机制演示)
```

`apps/api → packages/harness`。静态模式的 `apps/web` 只消费固定且脱敏的演示数据；本地显式模式通过 `/api/runs → apps/api` 调用 Harness。Harness 不依赖 React、Fastify 或现成 Agent 框架。

本地真实运行数据流：CLI 读取配置与加密凭据 → Harness 选择 Memory → Provider 单次补全 → 解析 Action → Policy → Tool → Feedback → Trace → 下一轮或停机。

## 7. 数据模型

```ts
interface MemoryItem {
  id: string;
  kind: "convention" | "recent_result";
  tags: readonly string[];
  content: string;
  updatedAt: string;
}

interface ToolResult {
  ok: boolean;
  exitCode?: number;
  output: string;
  errorCode?: string;
  truncated: boolean;
}

interface TraceEntry {
  step: number;
  action?: Action;
  policy: "allow" | "ask" | "deny";
  observation?: string;
  status: "running" | "completed" | "blocked" | "failed";
}
```

Memory 和 Trace 使用本地 JSON；加密凭据单独存储，三者不得混写。

## 8. 非功能性要求

- 安全：真实 Key 在 Git 历史、源码、日志、Trace、Memory、CI 和 WebUI 中零明文命中。
- 可靠：默认最大 8 步、失败自动修正最多 1 次、命令默认超时 60 秒、输出最多 32 KiB。
- 可测试：核心机制全部使用 mock 离线测试；一条 `pnpm test` 运行。
- 可用：Node 24 + pnpm 11；错误包含稳定错误码和用户可理解说明。
- 可观测：每轮保留脱敏 Trace，包含 Action、Policy、Tool/Feedback 摘要和停机原因。
- 性能：离线单元测试在普通开发机上目标 30 秒内完成；不设置企业级吞吐指标。
- 平台：本地 CLI 以 Windows 11 为主要验收平台；CI 使用 Linux Node 24；静态页面支持当前 Chromium/Firefox/Edge。

## 9. 技术选型

- TypeScript strict：共享类型并减少 Action/状态错误。
- Node.js 24、pnpm 11：与现有骨架和 CI 一致。
- Vitest：mock 机制的快速离线测试。
- Fastify：提供仅监听 `127.0.0.1` 且校验本地 Origin 的运行入口，不承载线上服务。
- React + Vite：构建静态 WebUI；选择 Open Design 的简洁中性设计原则与前端设计 skill，重点检查信息层级、状态颜色、键盘可用性和响应式布局，不为课程作业引入额外设计系统运行时。
- Node `crypto`：scrypt + AES-256-GCM 加密凭据，避免额外原生钥匙串依赖。
- npm tarball：满足包管理器分发要求，降低 Docker 和部署成本。
- GitLab CI/Release：匹配 NJU GitLab 仓库、精确 `unit-test` job 和助教允许的 CLI 托管交付方式；Pages 试验因实例未提供公开地址而停止。

## 10. 验收与课程要求映射

| 原始要求 | 最小验收 | 任务 |
| --- | --- | --- |
| 自研 Agent Loop | mock 驱动完整循环，不调用现成 runner | T09 |
| 六个 Harness 维度 | 每个维度至少一个源码模块和确定性测试 | T06–T09 |
| 重点维度深入 | 反馈分类、回灌、一次修正、失败停机 | T09 |
| 三项机制演示 | `pnpm demo` 自动断言且失败非零 | T10 |
| 安全凭据 | 加密文件、隐藏录入、状态/更新/清除、零泄露测试 | T10 |
| 一键测试与 TDD | `pnpm test`；每个功能保留 RED/GREEN 证据 | T05–T12 |
| 3 个以上模块 | API、Web、Harness、tests | T05 |
| CI | `.gitlab-ci.yml` 精确 `unit-test`，最后 Pipeline passed | T05/T12 |
| 分发 | npm tarball 全新目录安装 smoke | T12 |
| 托管部署 | 助教补充说明允许 CLI 项目提供托管平台 Release；使用 GitLab `v2.0.0` Release | T17/总控发布 |
| 过程证据 | SPEC/PLAN/SPEC_PROCESS/AGENT_LOG、分支/MR/评审记录 | 全程 |
| README | 必需章节完整 | T12 |
| 反思 | 本人撰写 1500–2500 字 | T12 |

## 11. 流程与完成 Gate

- 每个 Txx 使用独立 branch/worktree 和 MR，目标 `dev`，禁止 squash。
- 每个功能至少保存一次正确的 RED → GREEN；不重复无新增信息的复检。
- 每个 Task 使用一次新鲜 subagent，完成后做一次 Spec 合规检查和一次代码质量检查；只阻断 Critical。
- 每个 MR 的 Pipeline 必须 passed；`PLAN.md` 与 `AGENT_LOG.md` 记录 commit、MR、Pipeline 和人工修改。
- 最终 `dev → main` MR 合并后，`main` 最新 Pipeline passed 才算完成。

## 12. 风险与决策

- 学校 API 的实际模型名、配额和兼容差异在 T10 由负责人本地验证；失败不允许伪造成功。
- 学校 GitLab 的 Pages 作业能够构建静态产物，但实例没有生成可访问地址；依据助教部署补充说明，最终采用 CLI + GitLab Release。真实 Web 模式必须由用户在本机显式启动，且 Key 仍会短暂存在于浏览器和 Node 进程内存。
- 普通 Windows 流程使用当前用户系统保护，不询问主密码；旧式兼容加密文件仍依赖主密码强度，两种方式都无法消除进程内存中的短暂明文暴露。
- npm tarball 首版只承诺 Node 24 和文档列出的主要平台。
- 项目负责人已接受功能广度和企业级扩展性下降，以换取在课程截止前形成完整、可运行、可解释的交付物。
