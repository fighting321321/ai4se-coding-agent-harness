# T03 编写正式实现计划：提交级执行计划

> 当前分支：`docs/t03-implementation-plan`
>
> 执行规则：下面每个一级步骤对应且仅对应一个 Git 提交，必须按顺序执行。完成一个步骤时，在同一提交中勾选该步骤及其验收项。
>
> 分支说明：本分支只承载 T03。T03 审计完成后，以独立提交清空本文件，再将本分支合并到 `dev`。T04 必须从最新 `dev` 创建新的独立分支，并在该分支的第一个提交中重新填写本文件。

## 目标

依据已批准的 `SPEC.md`，创建根目录 `PLAN.md`，把 T05–T20 拆成新鲜智能体可以独立执行、每个动作约 2–5 分钟、具有明确文件路径、接口依赖、TDD 红—绿—重构步骤、验证命令、提交、分支和 MR 边界的正式实现计划。计划必须让执行者仅凭 `SPEC.md` 与 `PLAN.md` 判断每一步做什么、为什么、怎样验证以及何时停止。

## 全局约束

- 本任务只允许修改文档，不得创建工程骨架、依赖配置、测试代码、源码、Dockerfile 或 CI 配置。
- `SPEC.md` 1.0.0 是权威需求来源；T03 只能细化实现顺序和接口，不能自行改变产品边界、验收标准或安全不变量。
- `PLAN.md` 只规划 T05–T20；T04 负责陌生智能体冷启动验证，不得混入正式实现任务。
- 每个 Txx 使用独立 branch、worktree 和 MR；分支必须从当时最新 `dev` 创建，目标分支统一为 `dev`。
- 每个实现任务必须遵循 TDD：写失败测试、运行得到预期红色、写最小实现、运行变绿、在测试保护下重构、重新验证。
- 每个计划步骤必须是一个明确动作，预期耗时约 2–5 分钟；不得使用“实现核心功能”“完善测试”“处理异常”等模糊步骤。
- 每个代码步骤必须给出精确路径、接口/类型名称、关键代码或伪代码结构、运行命令和预期输出。
- 每个 Txx 必须写明前置依赖、产生的接口、影响文件、可能冲突的并行任务、测试范围、完成 Gate、提交和 MR 证据。
- 所有核心机制测试必须使用 mock/stub LLM，不联网、不使用真实模型或真实 key。
- 危险动作、冲突、过期快照、反馈、停机、凭据和脱敏必须由确定性代码控制，不能用 prompt、Skill 或配置替代。
- 每个 Txx 的任务分支首个提交填写 `guiding.md`，末尾提交清空 `guiding.md`；MR 禁止 squash。
- 所有提交信息使用 `类型: 中文解释` 格式；代码注释使用中文。
- T03 完成只代表 G2 计划确认；G3 冷启动通过前仍禁止编写实现代码。

## 文件职责

- `guiding.md`：T03 的提交级计划和进度；合并前通过独立末尾提交清空。
- `PLAN.md`：T05–T20 的权威执行计划、依赖图、文件地图、接口合同、TDD 步骤、分支/MR 和完成证据台账。
- `SPEC_PROCESS.md`：记录从 SPEC 到 PLAN 的关键拆解决策、计划审阅中采纳/拒绝/修改的建议，以及 G2 批准。
- `AGENT_LOG.md`：记录 T03 使用的 Skill、prompt/context、人工干预、验证结果和提交证据。
- `SPEC.md`：本任务只读，不得在 T03 分支修改；发现问题时记录为 T04 冷启动或正式 SPEC 修订输入。

## `PLAN.md` 目标结构

1. 文档控制、目标、架构摘要、技术栈与全局约束。
2. 实现文件地图：目录、文件职责、接口归属和测试位置。
3. 统一任务模板：文件、接口、依赖、TDD、验证、提交、MR 和证据。
4. T05–T20 的原子实现任务。
5. 需求追踪：`REQ-001`–`REQ-025`、用户故事、Txx 和测试的映射。
6. 依赖 DAG、关键路径、可并行任务和文件冲突矩阵。
7. branch/worktree/MR/Pipeline 规划与执行证据栏。
8. 冷启动使用说明、变更纪律、完成 Gate 和批准记录。

## 计划中的统一任务模板

每个可交给新鲜智能体的 Task 必须包含：

- **目标**：一句话描述独立可验收成果。
- **前置依赖**：具体 Txx/Task、接口和数据不变量。
- **文件**：精确列出 Create、Modify、Test 路径。
- **接口**：Consumes/Produces，写明类型或函数名称、参数和返回语义。
- **步骤**：每步 2–5 分钟，使用复选框。
- **红色证据**：失败测试代码、运行命令和预期失败原因。
- **绿色证据**：最小实现结构、运行命令和预期通过结果。
- **重构与回归**：明确重构目标和相关测试范围。
- **完成标准**：客观、可观察、可重复。
- **提交**：精确 `git add` 路径和中文 commit message。
- **评审与 MR**：Spec 合规、代码质量、Pipeline 和风险记录。

---

## 提交 1：建立 T03 提交级规划

**提交信息：** `docs: 规划T03实现计划步骤`

**修改文件：**

- 修改：`guiding.md`

**内容：**

- [x] 写明 T03 目标、范围、文件职责和 G2/G3 边界。
- [x] 固定 `PLAN.md` 的目标结构和统一任务模板。
- [x] 将 T05–T20 的计划编写拆成一次提交一个可审阅成果的顺序步骤。
- [x] 为每个提交写明内容、验证命令和提交信息。
- [x] 明确每个 Txx 独立分支/worktree/MR，以及 T03 合并前清空 `guiding.md`。

**提交前验证：**

```powershell
git diff --check
git diff -- guiding.md
git status --short
```

预期：`git diff --check` 无输出；只有 `guiding.md` 被修改；没有实现代码或工程文件。

**提交命令：**

```powershell
git add guiding.md
git commit -m "docs: 规划T03实现计划步骤"
```

---

## 提交 2：建立 PLAN 骨架、文件地图和接口命名

**提交信息：** `docs: 建立实现计划框架`

**修改文件：**

- 创建：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**`PLAN.md` 本提交必须完成：**

- [x] 按 writing-plans 规范写文档头：Goal、Architecture、Tech Stack、Global Constraints。
- [x] 记录当前基线：SPEC 版本、批准状态、目标平台、TypeScript/Node.js/Fastify/React/Vite/Zod/SQLite/Drizzle/Vitest/Playwright/Docker/GitLab。
- [x] 固定源码与测试目录地图，至少覆盖领域、应用、Agent Runtime、基础设施、Fastify API、React WebUI、共享 DTO、测试支持、演示、部署和文档。
- [x] 为每个目标文件写清单一职责，禁止把领域规则放进路由、React 组件或 ORM hook。
- [x] 固定跨任务接口命名：Decision、Scope、ContextSnapshot、TaskRun、Action、Observation、PolicyDecision、FeedbackResult、ApprovalRequest、TraceEvent、CredentialRef。
- [x] 固定错误码、状态机、时间/ID/哈希注入和脱敏的共享归属，避免后续任务重复定义。
- [x] 写统一 Task 模板、TDD 模板、提交模板、两阶段评审模板和 MR 证据模板。
- [x] 建立 `REQ-001`–`REQ-025` 追踪表骨架，每条只能有一个主要实现 Txx，可有多个验证 Txx。

**目录地图约束：**

- 后端模块化单体必须区分 `domain`、`application`、`infrastructure` 和 `server` 责任。
- WebUI 独立目录，只通过 HTTP/SSE DTO 与后端交互。
- 测试分为 unit、integration、e2e、mechanism demos 和 test-support。
- 具体目录一经本提交批准，后续任务必须使用相同路径；变更须同步所有 Task 和接口表。

**过程证据：**

- `SPEC_PROCESS.md` 记录目录布局和接口命名的候选方案、选择理由及拒绝的过度拆分方案。
- `AGENT_LOG.md` 记录 T03 启动、分支、基线、Skill、初始 prompt/context 和本提交验证结果。

**提交前验证：**

```powershell
git diff --check
Select-String -Path PLAN.md -Pattern "Goal","Architecture","Tech Stack","Global Constraints","文件地图","统一任务模板","REQ-001","REQ-025"
Select-String -Path PLAN.md -Pattern "Decision","ContextSnapshot","TaskRun","Action","Observation","TraceEvent","CredentialRef"
git status --short
```

预期：`PLAN.md` 已定义稳定目录和接口边界，但尚未写任何实现文件；改动仅包含四个文档文件。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 建立实现计划框架"
```

---

## 提交 3：规划 T05–T07 工程基础与动作分发

**提交信息：** `docs: 规划工程基础与工具分发任务`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**T05 工程骨架必须规划：**

- [x] `chore/t05-project-foundation` 独立 branch/worktree/MR。
- [x] 根依赖、锁文件、TypeScript 严格配置、Vitest、lint、typecheck、构建和一键测试入口。
- [x] 后端、前端、共享类型、测试支持、演示和部署目录骨架。
- [x] 先写最小健康测试并验证红色，再补最小模块使其变绿。
- [x] 新环境安装、测试、构建和 `.gitignore` 验证；不得提前实现业务机制。

**T06 LLM 抽象与 mock 必须规划：**

- [x] `feat/t06-mock-llm` 独立 branch/worktree/MR。
- [x] 单次调用的 `LLMClient` 接口、输入消息、结构化响应和错误分类。
- [x] `ScriptedMockLLM` 顺序响应、调用记录、耗尽行为、解析失败和修正脚本。
- [x] OpenAI-compatible 适配器只规划接口边界和测试替身，核心测试不联网。
- [x] 每个行为包含失败测试代码、预期失败、最小实现、通过命令和重构步骤。

**T07 Action、解析与工具分发必须规划：**

- [x] `feat/t07-tool-dispatch` 独立 branch/worktree/MR。
- [x] `Action`、`ToolCall`、`ToolResult`、`Observation` 的 Zod Schema 与 TypeScript 类型。
- [x] 严格解析、未知字段/未知 Action 拒绝、稳定错误码。
- [x] `ToolRegistry`、参数校验、Dispatcher、工具异常和超时结果。
- [x] mock LLM 到 mock Tool 的完整确定性分发链测试。

**接口衔接：**

- T05 提供测试/构建命令和目录；T06 提供 `LLMClient`；T07 只消费单次响应，不实现 Agent Loop。
- 明确 T05–T07 会共同修改的根配置文件，默认串行；不得把未合并的工作树直接互相依赖。

**提交前验证：**

```powershell
git diff --check
Select-String -Path PLAN.md -Pattern "T05","T06","T07","chore/t05-project-foundation","feat/t06-mock-llm","feat/t07-tool-dispatch"
Select-String -Path PLAN.md -Pattern "失败测试","预期失败","最小实现","重构","LLMClient","ScriptedMockLLM","ToolRegistry"
```

预期：T05–T07 每个 Task 均有精确文件、接口、红绿命令、提交和完成标准。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 规划工程基础与工具分发任务"
```

---

## 提交 4：规划 T08–T10 工具、治理与反馈

**提交信息：** `docs: 规划工具治理与反馈任务`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**T08 受限工具必须规划：**

- [x] `feat/t08-builtin-tools` 独立 branch/worktree/MR。
- [x] 工作区内文件读写、参数数组命令执行、realpath、symlink/junction 和敏感路径拒绝。
- [x] 命令 allowlist、超时、64 KiB 输出、环境变量过滤和结构化错误。
- [x] Windows/Linux 路径与命令差异的表驱动测试和跨平台验证。

**T09 治理与 HITL 必须规划：**

- [x] `feat/t09-governance` 独立 branch/worktree/MR。
- [x] `allow/ask/deny` 策略、不可覆盖 deny、结构化约束冲突检测。
- [x] Approval 状态机、动作摘要/文件摘要/快照指纹绑定、单次消费、拒绝、超时和失效。
- [x] 审批前工具调用为零；动作或快照变化后旧批准不可复用。

**T10 客观反馈必须规划：**

- [x] `feat/t10-feedback-loop` 独立 branch/worktree/MR。
- [x] FeedbackSensor 接口和测试/lint/typecheck/build/版本/契约传感器。
- [x] PASS、CODE_FAIL、POLICY_FAIL、TIMEOUT、ENV_ERROR 分类和结构化证据。
- [x] 失败回灌、最多三次连续失败、修复后复验和人工升级。

**TDD 与接口衔接：**

- T08 只执行受限工具；T09 在 Dispatcher 前裁决；T10 消费 ToolResult 并产生 FeedbackResult。
- 每个安全测试必须断言副作用未发生，不能只断言返回错误字符串。
- 明确三者可能同时修改 Action/Observation/Trace DTO 的冲突文件，默认串行合并 T08 → T09 → T10。

**提交前验证：**

```powershell
git diff --check
Select-String -Path PLAN.md -Pattern "T08","T09","T10","realpath","junction","allow/ask/deny","Approval","FeedbackSensor","ENV_ERROR"
Select-String -Path PLAN.md -Pattern "工具调用为零","副作用未发生","失败回灌","三次"
```

预期：工具、治理和反馈计划具有确定性测试与无副作用断言，不依赖 prompt 自觉。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 规划工具治理与反馈任务"
```

---

## 提交 5：规划 T11–T13 决策上下文、Trace 与主循环

**提交信息：** `docs: 规划上下文追踪与主循环任务`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**T11 记忆与上下文必须规划：**

- [x] `feat/t11-memory-context` 独立 branch/worktree/MR。
- [x] DecisionRecord/DecisionVersion/ScopeRule Repository、不可变版本和唯一活动版本事务。
- [x] 四级 Scope 匹配、稳定选择/排除理由、规范序列化、SHA-256 快照指纹。
- [x] 快照过期检测、Decision diff、Rebaseline、旧 Action/Approval 失效和敏感信息拒绝。

**T12 配置、日志与 Trace 必须规划：**

- [x] `feat/t12-config-tracing` 独立 branch/worktree/MR。
- [x] 配置 Schema、安全默认值、错误配置快速失败和预算。
- [x] TraceEvent 单调序号、事务持久化、SSE 只推已持久化事件、30 天保留边界。
- [x] 统一脱敏器和假 Key 注入测试，确保数据库、日志、API、SSE、导出均无明文。

**T13 自研 Agent Loop 必须规划：**

- [x] `feat/t13-agent-loop` 独立 branch/worktree/MR。
- [x] 上下文构建、LLM 单次调用、Action 解析、写前版本/策略检查、工具执行、反馈回灌。
- [x] 完成门和停机原因：completed、最大 30 Step、预算耗尽、连续失败、审批拒绝、人工取消、环境故障。
- [x] 快照过期进入 `rebaseline_required`，生成新快照并强制重新规划，禁止复用旧 Action。
- [x] 完整循环由 ScriptedMockLLM 驱动，不调用任何现成 Agent Runner。

**关键 Gate：**

- T13 合并后必须通过 G4：mock 驱动主循环、工具、治理、反馈、记忆和停机形成完整闭环。
- 明确 T11–T13 的状态机和 DTO 冲突，按 T11 → T12 → T13 串行；T12 的纯脱敏器可在接口冻结后并行实现。

**提交前验证：**

```powershell
git diff --check
Select-String -Path PLAN.md -Pattern "T11","T12","T13","DecisionVersion","ScopeRule","SHA-256","Rebaseline","TraceEvent","SSE","Agent Loop","G4"
Select-String -Path PLAN.md -Pattern "旧 Action","现成 Agent Runner","最大 30 Step","停机原因"
```

预期：主贡献基础、Trace 和主循环计划形成端到端闭环，并有 G4 的客观判定命令。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 规划上下文追踪与主循环任务"
```

---

## 提交 6：规划 T14–T16 主要贡献、演示与 WebUI

**提交信息：** `docs: 规划主要贡献演示与界面任务`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**T14 主要贡献深化必须规划：**

- [x] `feat/t14-main-contribution` 独立 branch/worktree/MR。
- [x] 变形/顺序测试证明范围选择和规范序列化确定性。
- [x] DecisionVersion 并发、快照指纹、结构化 diff、Rebaseline 上限和冲突爆炸保护。
- [x] 至少三个深度特性及独立确定性测试，并明确停止扩展通用平台功能。

**T15 三项机制演示必须规划：**

- [x] `test/t15-mechanism-demos` 独立 branch/worktree/MR。
- [x] DEMO-01：危险 Action 被 deny，工具调用为零，审计存在。
- [x] DEMO-02：第一次 CODE_FAIL 回灌，mock 改变 Action，第二次 PASS。
- [x] DEMO-03：版本 2 激活后，版本 1 快照在写前阻断，diff/Rebaseline/重新规划完成。
- [x] 单一命令运行全部演示，失败退出码非零，多次运行结果一致；通过后 G5。

**T16 WebUI 必须规划：**

- [x] `feat/t16-webui` 独立 branch/worktree/MR。
- [x] 任务创建、运行步骤、工具结果、反馈、审批、决策差异、Rebaseline、Trace、停机原因和凭据状态页面。
- [x] React 只消费白名单 DTO；安全裁决全部在后端；SSE 断线/重连不能显示假成功。
- [x] Open Design 主题决策、键盘操作、无障碍扫描和 Playwright mock e2e。

**并行边界：**

- T14 依赖 T11–T13；T15 依赖 T14；T16 可在 API/DTO 冻结后与 T14 部分并行，但共享 DTO 变更必须串行评审。

**提交前验证：**

```powershell
git diff --check
Select-String -Path PLAN.md -Pattern "T14","T15","T16","变形","DEMO-01","DEMO-02","DEMO-03","G5","Playwright","Open Design"
Select-String -Path PLAN.md -Pattern "工具调用为零","失败退出码非零","假成功","共享 DTO"
```

预期：主要贡献、三项演示和 WebUI 计划均有可重复测试与清晰依赖。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 规划主要贡献演示与界面任务"
```

---

## 提交 7：规划 T17–T20 安全、CI、分发与最终交付

**提交信息：** `docs: 规划安全分发与最终交付任务`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**T17 凭据安全必须规划：**

- [ ] `feat/t17-credential-security` 独立 branch/worktree/MR。
- [ ] Argon2id 派生、AES-256-GCM 加密、主密钥文件/Secret 注入和 CredentialRef。
- [ ] 隐藏录入、状态、更新、清除、存储不可用、轮换和真实 Provider 禁用降级。
- [ ] 假 Key 覆盖内存边界、数据库、日志、Trace、API、SSE、前端、错误和子进程环境。

**T18 GitLab CI/CD 必须规划：**

- [ ] `ci/t18-gitlab-pipeline` 独立 branch/worktree/MR。
- [ ] `.gitlab-ci.yml` 和名称精确为 `unit-test` 的离线 job。
- [ ] lint、typecheck、integration-test、e2e、secret-scan、机制演示和 Docker 构建。
- [ ] 失败 job 不得 `allow_failure`；每次 push 运行；记录 Pipeline URL/ID。

**T19 分发与线上部署必须规划：**

- [ ] `chore/t19-distribution-deploy` 独立 branch/worktree/MR。
- [ ] Linux amd64 单容器、React 静态资源、Fastify、`/data` SQLite 持久卷、健康检查。
- [ ] Registry、安装/启动/升级/备份/恢复、Secret、单副本、HTTPS、登录、限速、预算和 smoke test。
- [ ] 决定 OPEN-01/02/05/06，提供公网 WebUI URL 和分发地址；通过 G6。

**T20 文档与最终审计必须规划：**

- [ ] `docs/t20-final-delivery` 独立 branch/worktree/MR。
- [ ] README、REFLECTION、SPEC/PLAN/日志、架构、运行、演示、凭据、分发、许可证和限制。
- [ ] 冷启动安装、一键测试、三项演示、凭据扫描、Git 历史审计、线上 smoke、最终 Pipeline。
- [ ] 更新 PLAN 每个 Task 的 commit/MR/Pipeline，创建 `dev → main` MR，通过 G7。

**提交前验证：**

```powershell
git diff --check
Select-String -Path PLAN.md -Pattern "T17","T18","T19","T20","Argon2id","AES-256-GCM","unit-test","Docker","/data","REFLECTION","G6","G7"
Select-String -Path PLAN.md -Pattern "allow_failure","Pipeline","公网 WebUI","凭据扫描","dev → main"
```

预期：安全、CI、分发和最终交付均有全新环境验证与具体证据字段。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 规划安全分发与最终交付任务"
```

---

## 提交 8：补齐依赖图、并行边界与分支 MR 规划

**提交信息：** `docs: 完善任务依赖与并行规划`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**依赖与并行必须完成：**

- [ ] Mermaid DAG 覆盖 T05–T20，并标出 G4、G5、G6、G7。
- [ ] 列出关键路径和每个 Txx 的前置条件、可开始条件、阻塞条件和完成输出。
- [ ] 建立文件冲突矩阵：根配置、共享 DTO、状态机、数据库 Schema、Trace、API、WebUI、Docker、CI 和 README。
- [ ] 标出安全可并行的 Task，以及即使逻辑独立也因共享文件必须串行的 Task。
- [ ] 每个 Txx 写明 branch 名、worktree 目录建议、目标 MR、Pipeline Gate 和禁止 squash。
- [ ] 每个 Txx 的首尾 `guiding.md` 提交纳入计划，且不与业务提交混合。
- [ ] 规定新鲜 subagent 的最小 context：SPEC 对应章节、PLAN 当前 Task、依赖接口、相关文件和测试命令；不得全量灌入无关历史。
- [ ] 每个 Task 完成后先 Spec 合规评审，再代码质量评审；Critical 问题修复后才能进入下一 Task。

**需求覆盖必须完成：**

- [ ] `REQ-001`–`REQ-025` 均映射到主要实现 Txx 和验证 Txx。
- [ ] US-01–US-09、NFR、DEMO-01–03、OPEN-01–06 均有后续处理位置。
- [ ] 不得把 T03 自己写成实现依赖；T04 冷启动只验证 PLAN，不修改实现代码。

**提交前验证：**

```powershell
git diff --check
$branches=(Select-String -Path PLAN.md -Pattern '`(chore|feat|test|ci|docs)/t(0[5-9]|1[0-9]|20)[^`]*`').Count; if($branches -lt 16){throw "T05–T20 分支映射不完整"}
Select-String -Path PLAN.md -Pattern "依赖 DAG","关键路径","文件冲突矩阵","可并行","Spec 合规","代码质量","Critical"
Select-String -Path PLAN.md -Pattern "REQ-001","REQ-025","US-09","DEMO-03","OPEN-06"
```

预期：16 个 Txx 均有独立分支/MR；依赖、并行和共享文件风险可由新鲜智能体直接判断。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 完善任务依赖与并行规划"
```

---

## 提交 9：完成 PLAN 自审、批准与 G2 审计

**提交信息：** `docs: 确认项目实现计划`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**逐项自审：**

- [ ] Spec coverage：`SPEC.md` 每个用户故事、功能模块、六维机制、NFR、交付要求和 `REQ-001`–`REQ-025` 均能指向具体 Task。
- [ ] Placeholder scan：不得存在未定义缩写、空章节、模糊动词或无约束占位符。
- [ ] Type consistency：跨 Txx 的类型、函数、事件、状态、错误码和文件路径完全一致。
- [ ] Task granularity：每步约 2–5 分钟，一个动作一个复选框；任务可由新鲜 subagent 单独执行。
- [ ] TDD completeness：每个实现行为都有失败测试代码、红色命令/原因、最小实现、绿色命令、重构和回归。
- [ ] Exact paths：所有 Create/Modify/Test 使用精确路径，不使用“相关文件”。
- [ ] Verification：每个 Task 都有可复制命令、预期输出和客观完成标准。
- [ ] Git evidence：每个 Txx 有分支、worktree、commit、MR、Pipeline 和人工评审记录位置。
- [ ] Security：真实 key、网络和危险副作用不会进入核心测试或演示。

**批准与过程证据：**

- [ ] 项目负责人逐章阅读 PLAN，对 T05–T20 和依赖/并行章节记录“批准”或“修改后批准”。
- [ ] `SPEC_PROCESS.md` 记录 AI 建议及负责人采纳、拒绝、修改理由，以及 PLAN 相对 SPEC 的细化点。
- [ ] `AGENT_LOG.md` 记录提交 1–8 hash、自审命令、人工干预、经验和 T04 移交说明。
- [ ] `PLAN.md` 写入版本、批准时间、批准状态和 G2 结论，但明确 G3 前禁止实现。
- [ ] 明确 T04 陌生智能体只获得 `SPEC.md` 和 `PLAN.md`，遇到不确定立即暂停，不得猜测或获得口头补充。
- [ ] 明确下一提交只清空 `guiding.md`，随后创建目标为 `dev` 的 T03 MR。

**提交前验证：**

```powershell
git diff --check
git log --oneline dev..HEAD
git diff --name-only dev...HEAD
$bad=Select-String -Path PLAN.md -Pattern 'TBD|TODO|待补充|实现核心功能|完善测试|相关文件|implement later|fill in details'; if($bad){$bad; throw "PLAN 存在占位符或模糊步骤"}
Select-String -Path PLAN.md -Pattern "批准状态","批准时间","G2","G3","T04"
Select-String -Path SPEC_PROCESS.md -Pattern "采纳","拒绝","修改","最终批准"
git status --short
```

预期：相对 `dev` 只包含 `PLAN.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md` 和 `guiding.md`；PLAN 无占位符，T05–T20 全部可独立执行，G2 有明确批准证据。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 确认项目实现计划"
```

---

## 提交 10：清空 T03 任务规划

**提交信息：** `docs: 清空T03任务规划`

**修改文件：**

- 修改：`guiding.md`，删除全部内容并保持空文件继续受 Git 跟踪

**执行要求：**

- [ ] 确认提交 1–9 已按顺序存在，PLAN 自审、逐章批准和 G2 审计无未完成项。
- [ ] 清空 `guiding.md`，不得删除该文件。
- [ ] 本提交不得夹带 `PLAN.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md` 或其他文件改动。

**提交前验证：**

```powershell
git diff --check
if ((Get-Content -Raw guiding.md).Trim().Length -ne 0) { throw "guiding.md 尚未清空" }
git status --short
```

预期：`git diff --check` 无输出；内容长度检查成功；只有 `guiding.md` 被修改。

**提交命令：**

```powershell
git add guiding.md
git commit -m "docs: 清空T03任务规划"
```

**提交后分支动作：**

```powershell
git log --oneline dev..HEAD
git diff --check dev...HEAD
git status --short
```

预期：T03 的规划与清空提交均保留，工作区干净，可以推送并创建 `docs/t03-implementation-plan -> dev` 的 MR；禁止 squash。

---

## T03 完成判定

只有同时满足以下条件，才可合并 T03；T03 合入 `dev` 后才能从最新 `dev` 创建 T04 独立分支：

- [ ] `PLAN.md` 覆盖 T05–T20、`REQ-001`–`REQ-025`、US-01–09、DEMO-01–03 和 OPEN-01–06。
- [ ] 每个 Task 具有精确文件、接口、依赖、失败测试、预期红色、最小实现、绿色验证、重构、提交和完成标准。
- [ ] 任一 Task 可由新鲜 subagent 仅凭 SPEC、PLAN 和最小相关上下文独立执行。
- [ ] 依赖 DAG、关键路径、并行边界和文件冲突矩阵完整。
- [ ] T05–T20 每个一级任务都有独立 branch、worktree、MR 和 Pipeline Gate。
- [ ] 项目负责人逐章阅读并批准，`SPEC_PROCESS.md` 保留采纳、拒绝和修改证据。
- [ ] G2 计划确认通过；G3 仍未通过且全程未创建任何实现代码或工程配置。
- [ ] `guiding.md` 已通过独立末尾提交清空，MR 禁止 squash。
