# T02 完成并确认需求规约：提交级执行计划

> 当前分支：`docs/t02-requirements-spec`
>
> 执行规则：下面每个一级步骤对应且仅对应一个 Git 提交，必须按顺序执行。完成一个步骤时，在同一提交中勾选该步骤及其验收项。
>
> 分支说明：本分支只承载 T02。T02 审计完成后，以独立提交清空本文件，再将本分支合并到 `dev`。T03 必须从最新 `dev` 创建新的独立分支，并在该分支的第一个提交中重新填写本文件。

## 目标

把 T01 已批准的“决策感知型 Coding Agent Harness”设计输入沉淀为完整、内部一致、可客观验收的 `SPEC.md`。规约必须让陌生智能体只凭文档就能理解产品价值、功能边界、系统架构、数据约束、安全分发方案、Harness 六维机制和主要贡献，并能在 T03 中进一步拆成原子实现计划。

## 全局约束

- 本任务只允许修改文档，不得创建工程骨架、依赖配置、测试代码、业务源码或部署文件。
- T01 已批准的产品定位、真实问题、主要贡献和非目标是 T02 的输入；如需改变，必须先在 `SPEC_PROCESS.md` 记录理由、候选方案和项目负责人确认。
- `SPEC.md` 必须写可验证要求，不得使用“适当”“尽量”“必要时”“支持常见情况”等无法验收的模糊表述。
- 所有未决问题必须写清选项、影响、负责人、最迟决策阶段和默认保守行为，不得写成无约束占位符。
- 六个 Harness 维度都必须有可运行的最低代码机制；主要贡献“版本化决策记忆与上下文”必须明显更深。
- 主循环、工具分发、治理、反馈、记忆与上下文机制必须由项目代码实现，不能寄生于现成 Agent Runner、Skill、hook 或 prompt。
- 每个核心机制必须说明移除真实 LLM 后的确定性测试方法；单元测试不得依赖网络、真实模型或真实 key。
- 凭据不得硬编码、提交进 Git、写入日志、Trace、记忆、错误信息或命令历史。
- 正式实现前仍受 G3 限制；本分支不得提前进入 T03–T20 的实现工作。
- 所有提交信息使用 `类型: 中文解释` 格式；每个提交只承载本步骤定义的文档成果。

## 文件职责

- `guiding.md`：T02 的提交级计划和进度标记；合并前必须以独立末尾提交清空。
- `SPEC.md`：经过逐节确认的正式需求与设计规约，是 T03、T04 和后续实现的唯一权威需求来源。
- `SPEC_PROCESS.md`：继续记录 AI 建议、项目负责人采纳/拒绝/修改、逐节审阅结论和规约演化。
- `AGENT_LOG.md`：按时间记录 T02 使用的 Skill、prompt/context、人工干预、验证结果和提交证据。

## `SPEC.md` 目标结构

1. 文档状态、版本和适用范围。
2. 问题陈述、目标用户、价值、目标与非目标。
3. 术语、角色和至少五个 INVEST 用户故事。
4. 功能规约：每个模块的输入、行为、输出、边界条件、错误处理和客观验收。
5. 领域与机制设计：工具、反馈、危险动作、记忆需求、六维最低实现、主要贡献和确定性验证。
6. 系统架构：组件图、数据流、信任边界、外部依赖和关键接口。
7. 数据模型：实体、字段、关系、状态机、不变量、版本与并发约束。
8. 非功能性需求：性能、安全、可靠性、可用性、可观测性、兼容性和资源边界。
9. 凭据威胁模型与安全存储生命周期。
10. 技术选型、WebUI、分发、CI/CD 和线上部署方案。
11. 需求—验收—测试追踪矩阵。
12. 风险、未决问题、后续决策点和批准记录。

---

## 提交 1：建立 T02 提交级规划

**提交信息：** `docs: 规划T02需求规约步骤`

**修改文件：**

- 修改：`guiding.md`

**内容：**

- [ ] 写明 T02 的目标、范围、硬性约束和文件职责。
- [ ] 固定 `SPEC.md` 的目标章节结构。
- [ ] 将规约编写拆成一次提交一个可审阅成果的顺序步骤。
- [ ] 为每个提交写明文件范围、内容要求、验证命令和提交信息。
- [ ] 明确 T02 独立分支、合并前清空 `guiding.md`、T03 另建分支的生命周期。

**提交前验证：**

```powershell
git diff --check
git diff -- guiding.md
git status --short
```

预期：`git diff --check` 无输出；只有 `guiding.md` 被修改；计划不包含任何实现代码任务。

**提交命令：**

```powershell
git add guiding.md
git commit -m "docs: 规划T02需求规约步骤"
```

---

## 提交 2：定义产品需求、角色和用户故事

**提交信息：** `docs: 编写产品需求与用户故事`

**修改文件：**

- 创建：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**`SPEC.md` 本提交必须完成：**

- [ ] 文档状态、版本、适用范围、权威来源和变更规则。
- [ ] 问题陈述：小型开发团队的决策如何在成员、Agent、会话和分支之间断裂，以及为什么 Git/MR/CI 不能独自解决。
- [ ] 目标用户、次要角色、当前工作方式、三个已批准使用场景和失败代价。
- [ ] 30 秒价值陈述、产品目标、量化成功信号和明确非目标。
- [ ] 术语表：Decision、DecisionVersion、Scope、ContextSnapshot、TaskRun、Rebaseline、Conflict、HITL、Observation、Trace。
- [ ] 至少五个符合 INVEST 的用户故事；每条包含角色、目标、价值、前置条件和独立验收结果。
- [ ] 用户故事至少覆盖：记录决策、按范围选择决策、生成可复现快照、检测过期快照、冲突审批、运行 Agent、查看 Trace。

**过程证据：**

- `SPEC_PROCESS.md` 记录从 T01 结论到正式产品需求的映射、AI 提出的补充以及负责人逐项采纳/拒绝/修改。
- `AGENT_LOG.md` 记录 T02 启动、分支和基线 commit、Skill、初始 prompt/context、人工确认与本提交验证结果。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC.md -Pattern "问题陈述","目标用户","价值陈述","非目标","术语","用户故事"
$stories=(Select-String -Path SPEC.md -Pattern '^### US-[0-9]+').Count; if($stories -lt 5){throw "用户故事少于 5 个"}
Select-String -Path SPEC_PROCESS.md -Pattern "采纳","拒绝","修改"
git status --short
```

预期：至少五个编号用户故事；产品定位与 T01 一致；改动仅包含四个文档文件。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 编写产品需求与用户故事"
```

---

## 提交 3：完成模块化功能规约

**提交信息：** `docs: 完善功能模块规约`

**修改文件：**

- 修改：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**必须定义的功能模块：**

- [ ] 决策登记与不可变版本历史。
- [ ] 决策范围匹配、优先级和状态筛选。
- [ ] `ContextSnapshot` 的确定性生成、内容摘要和指纹。
- [ ] 任务启动、快照绑定、Agent 运行状态和停机原因。
- [ ] 写入前的快照过期检测、决策差异展示和 Rebaseline。
- [ ] 互斥决策检测、结构化冲突和 HITL 审批。
- [ ] 受限文件/命令工具、客观反馈传感器和失败回灌。
- [ ] Trace、审计查询和 WebUI 展示。
- [ ] 凭据状态、录入、更新和清除的用户流程。

**每个模块必须使用统一模板：**

- 输入及其前置条件。
- 正常行为和确定性规则。
- 输出及可观察结果。
- 边界条件和明确限制。
- 参数错误、状态错误、冲突、超时和环境错误的处理。
- 至少一个可由测试或演示验证的验收条件。
- 与用户故事、数据实体和其他模块的依赖。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC.md -Pattern "决策登记","范围匹配","ContextSnapshot","过期检测","Rebaseline","HITL","反馈传感器","Trace","凭据"
Select-String -Path SPEC.md -Pattern "输入","行为","输出","边界条件","错误处理","验收"
git diff --stat
```

预期：九类功能均有完整规约，没有只列名称或愿望式描述的模块。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 完善功能模块规约"
```

---

## 提交 4：完成领域与 Harness 机制设计

**提交信息：** `docs: 完善领域与机制设计`

**修改文件：**

- 修改：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**六维最低机制必须写清：**

- [ ] 决策：自研 Agent 主循环如何组织上下文、调用单次 LLM 接口、解析动作、执行、回灌和停机。
- [ ] 工具：注册、schema、参数校验、工作区围栏、超时、输出限制和结构化异常。
- [ ] 记忆与上下文：决策版本存储、范围选择、快照生成、过期检测、Rebaseline 和清除策略。
- [ ] 治理：`allow/ask/deny`、审批状态机、动作绑定、拒绝/超时和审计。
- [ ] 反馈：版本、契约、测试/lint/类型检查/构建传感器，失败分类、回灌、重试和升级。
- [ ] 配置与可观测性：安全默认值、schema 校验、脱敏日志、Trace 和预算。

**A 方向边界必须写清：**

- [ ] LLM 抽象只负责单次模型调用，允许注入脚本化 mock。
- [ ] 不使用 LangChain AgentExecutor、AutoGen、CrewAI、LlamaIndex Agent 或宿主 Agent Runner 充当内核。
- [ ] prompt、Skill、配置和规则文件只是内容物，不计入 Harness 内核工作量。
- [ ] 每个机制都说明不使用真实 LLM 时如何直接构造输入并确定性断言结果。
- [ ] 三项强制演示：危险动作拦截、失败驱动修正、版本化决策上下文行为。

**主要贡献必须写深：**

- [ ] 不可变 DecisionVersion、确定性 Scope 匹配、选择/排除理由、规范序列化和快照指纹。
- [ ] 旧快照写前阻断、决策 diff、Rebaseline 后重新规划、旧动作失效。
- [ ] 同范围互斥决策的结构化冲突和 HITL，且审批绑定原始冲突与动作参数。
- [ ] 六条 T01 成功判据全部转成可观测、可测试要求。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC.md -Pattern "决策主循环","工具分发","记忆与上下文","治理","反馈","配置与可观测性"
Select-String -Path SPEC.md -Pattern "mock","确定性","现成","内容物","危险动作拦截","失败驱动修正"
Select-String -Path SPEC.md -Pattern "DecisionVersion","Scope","指纹","Rebaseline","旧动作","结构化冲突"
```

预期：六维最低机制、主要贡献深度和三项演示均有代码机制与离线验证说明。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 完善领域与机制设计"
```

---

## 提交 5：定义系统架构、接口和数据约束

**提交信息：** `docs: 定义系统架构与数据模型`

**修改文件：**

- 修改：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**系统架构必须包含：**

- [ ] Mermaid 组件图，明确 WebUI/API、Agent Runtime、LLM Adapter、Decision Store、Context Selector、Tool Registry、Policy Engine、Feedback Engine、Credential Store 和 Trace Store。
- [ ] Mermaid 主数据流：创建任务、生成快照、LLM 产生活动、治理检查、工具执行、反馈回灌和停机。
- [ ] Mermaid 过期与冲突流：写前校验、阻断、diff、审批、Rebaseline 和重新规划。
- [ ] 组件职责、同步/异步边界、信任边界和失败隔离原则。
- [ ] 外部依赖及其不可用时的行为；真实 LLM 不得成为离线测试依赖。
- [ ] 核心接口的输入、输出、错误类型和调用方向，但本阶段不锁定实现代码签名。

**数据模型必须包含：**

- [ ] `DecisionRecord`、`DecisionVersion`、`ScopeRule`、`ContextSnapshot`、`SnapshotEntry`。
- [ ] `TaskRun`、`AgentStep`、`Action`、`ToolCall`、`ToolResult`、`Observation`。
- [ ] `FeedbackResult`、`ApprovalRequest`、`PolicyDecision`、`TraceEvent`、`CredentialRef`。
- [ ] 每个实体的标识、字段、类型语义、必填性、关系、唯一约束和生命周期。
- [ ] 决策状态、任务状态和审批状态的状态机及非法转换。
- [ ] 版本顺序、并发写入、规范序列化、时间来源、哈希/指纹和敏感字段不变量。

**提交前验证：**

```powershell
git diff --check
$mermaid=(Select-String -Path SPEC.md -Pattern '^```mermaid').Count; if($mermaid -lt 3){throw "Mermaid 图少于 3 个"}
Select-String -Path SPEC.md -Pattern "DecisionRecord","ContextSnapshot","TaskRun","ApprovalRequest","TraceEvent","CredentialRef"
Select-String -Path SPEC.md -Pattern "状态机","非法转换","并发","规范序列化","信任边界"
```

预期：至少三张图；组件、数据和状态约束足以让 T03 拆分实现边界，不存在同名异义实体。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 定义系统架构与数据模型"
```

---

## 提交 6：定义非功能需求与凭据安全

**提交信息：** `docs: 明确非功能需求与凭据安全`

**修改文件：**

- 修改：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**非功能要求必须可测量：**

- [ ] 性能：冷启动、快照生成、查询、写前校验、Trace 写入和 WebUI 响应的目标及测量数据规模。
- [ ] 可靠性：原子写入、崩溃恢复、幂等、超时、重试上限、预算耗尽和明确停机。
- [ ] 安全：工作区围栏、路径逃逸、符号链接、命令 allowlist、敏感信息脱敏和最小权限。
- [ ] 可用性：首次启动、错误提示、审批可理解性、无障碍和用户不得被假成功误导。
- [ ] 可观测性：每轮决策、动作、观察、反馈、审批、快照版本和停机原因可追溯。
- [ ] 兼容性与资源：目标操作系统、CPU 架构、运行时版本范围、并发、磁盘、日志保留和成本上限。

**凭据威胁模型必须包含：**

- [ ] 资产、攻击者、入口、信任边界和滥用场景。
- [ ] 禁止凭据进入源码、Git 历史、命令历史、日志、Trace、记忆、错误信息和前端回显。
- [ ] 首选安全存储方案及目标平台适配；`.env` 只作为可选来源并说明明文风险。
- [ ] 隐藏录入、仅显示配置状态、更新、清除、无效凭据和存储不可用流程。
- [ ] 日志脱敏、异常清理、测试替身、凭据扫描和泄露后的轮换处置。
- [ ] 每条威胁对应预防、检测和恢复措施以及验证方式。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC.md -Pattern "性能","可靠性","安全","可用性","可观测性","兼容性","资源"
Select-String -Path SPEC.md -Pattern "威胁模型","隐藏录入","更新","清除","\.env","Git 历史","脱敏","轮换"
Select-String -Path SPEC.md -Pattern "毫秒","秒","上限","不得"
```

预期：非功能要求具有数值或明确布尔判据；威胁、措施和验证形成对应关系。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 明确非功能需求与凭据安全"
```

---

## 提交 7：确定技术选型、分发和部署方案

**提交信息：** `docs: 确定技术分发与部署方案`

**修改文件：**

- 修改：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**必须作出的决策：**

- [ ] 语言、后端/WebUI 框架、测试框架、配置格式、持久化方案及选择理由。
- [ ] LLM 供应商适配策略、默认开发方式和 mock 优先原则；内核不得依赖供应商 Agent SDK。
- [ ] WebUI 信息架构：任务、步骤、工具结果、反馈、审批、决策差异、Trace、停机原因和凭据状态。
- [ ] 是否采用 Open Design；如不采用，写明设计系统替代方案和理由。
- [ ] 分发形态、目标操作系统与 CPU 架构、获取方式、安装、启动和卸载边界。
- [ ] CI/CD：GitLab `.gitlab-ci.yml`、名称精确为 `unit-test` 的 job、离线测试、lint、类型检查、凭据扫描和分发构建。
- [ ] 线上 WebUI 部署架构、公开 URL 目标、服务端密钥配置、成本/速率/资源上限和 smoke test。
- [ ] 全新机器冷启动流程，以及用户如何安全录入自己的 key。

**规范差异处理：**

- [ ] 记录课程材料中 GitHub/Actions 与最终 GitLab/`.gitlab-ci.yml` 要求的差异。
- [ ] 结合当前 NJU GitLab 远端，明确本项目以 GitLab MR、Pipeline 和 `unit-test` job 为准。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC.md -Pattern "技术选型","测试框架","持久化","LLM 供应商","WebUI","Open Design"
Select-String -Path SPEC.md -Pattern "分发","目标操作系统","CPU","GitLab","unit-test","部署","smoke test","冷启动"
Select-String -Path SPEC_PROCESS.md -Pattern "GitHub","GitLab","采纳"
```

预期：关键技术和交付方案均有明确选择及理由，不把选择推迟给实现智能体。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 确定技术分发与部署方案"
```

---

## 提交 8：建立验收追踪、风险和决策点

**提交信息：** `docs: 完善验收标准与风险决策`

**修改文件：**

- 修改：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**验收追踪矩阵必须包含：**

- [ ] 唯一需求编号。
- [ ] 关联用户故事和功能模块。
- [ ] 可观察的通过条件和失败条件。
- [ ] 计划使用的验证层级：单元、集成、机制演示、端到端、CI、人工可用性或线上 smoke test。
- [ ] 是否依赖真实 LLM、网络或 key；核心机制行必须全部为否。
- [ ] 对应未来任务 T05–T20 的建议归属，但不得在本阶段编写 `PLAN.md`。

**风险与未决问题必须包含：**

- [ ] 版本化决策范围匹配错误、冲突爆炸、快照存储增长和 Rebaseline 循环。
- [ ] 跨平台命令与路径隔离、符号链接、凭据存储兼容性和 WebUI/Runtime 信任边界。
- [ ] LLM 输出解析失败、供应商不可用、传感器环境错误、Trace 泄密和部署成本。
- [ ] 规约复杂度超过个人项目周期、主要贡献被基础模块稀释和演示不可理解。
- [ ] 每项风险的概率、影响、预防、检测、恢复和最迟处理任务。
- [ ] 每个未决问题的候选选项、当前倾向、负责人、最迟决策阶段及未决时的保守默认行为。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC.md -Pattern "追踪矩阵","需求编号","通过条件","失败条件","验证层级"
Select-String -Path SPEC.md -Pattern "风险","概率","影响","预防","检测","恢复","未决问题","最迟决策"
$req=(Select-String -Path SPEC.md -Pattern '^\| REQ-[0-9]+').Count; if($req -lt 10){throw "可追踪需求少于 10 条"}
```

预期：至少十条可追踪需求；全部风险和未决问题都有处理时间点与保守默认值。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 完善验收标准与风险决策"
```

---

## 提交 9：逐节确认规约并完成 T02 审计

**提交信息：** `docs: 确认项目需求规约`

**修改文件：**

- 修改：`SPEC.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**逐节审阅：**

- [ ] 项目负责人逐节阅读 `SPEC.md`，对每节记录“批准”“修改后批准”或“拒绝并退回”。
- [ ] `SPEC_PROCESS.md` 记录重要 AI 建议及项目负责人采纳、拒绝、修改的理由，不得只写最终结论。
- [ ] 核对用户故事、功能模块、架构组件、数据实体、需求编号和验收项之间的一致性。
- [ ] 核对 T01 六条主要贡献成功判据全部进入正式规约和验收矩阵。
- [ ] 核对所有功能都有输入、行为、输出、边界、错误处理和验收条件。
- [ ] 核对凭据、分发、WebUI、CI、部署、mock 测试和三项机制演示没有遗漏。
- [ ] 删除重复、矛盾、无法验证或未经确认的要求；不得遗留空章节和占位符。
- [ ] 在 `SPEC.md` 写入版本号、批准时间、批准状态和进入 T03 的前置条件。

**T02 审计记录：**

- [ ] `AGENT_LOG.md` 记录提交 1–8 的 hash、逐节审阅、人工干预、验证命令和经验。
- [ ] `SPEC_PROCESS.md` 写入 T02 最终批准摘要，以及相对 T01 的新增、细化和变更。
- [ ] 明确 G1 只有在本提交完成且项目负责人批准全部章节后才通过。
- [ ] 明确下一提交只清空 `guiding.md`，随后创建目标为 `dev` 的 T02 MR。

**提交前验证：**

```powershell
git diff --check
git log --oneline dev..HEAD
git diff --name-only dev...HEAD
$bad=Select-String -Path SPEC.md -Pattern 'TBD|TODO|待补充|待定|implement later|fill in details'; if($bad){$bad; throw "SPEC 存在占位符"}
Select-String -Path SPEC.md -Pattern "批准状态","批准时间","进入 T03"
Select-String -Path SPEC_PROCESS.md -Pattern "采纳","拒绝","修改","最终批准"
git status --short
```

预期：相对 `dev` 只包含 `SPEC.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md` 和 `guiding.md`；规约无占位符，所有章节都有明确批准记录。

**提交命令：**

```powershell
git add SPEC.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 确认项目需求规约"
```

---

## 提交 10：清空 T02 任务规划

**提交信息：** `docs: 清空T02任务规划`

**修改文件：**

- 修改：`guiding.md`，删除全部内容并保持空文件继续受 Git 跟踪

**执行要求：**

- [ ] 确认提交 1–9 已按顺序存在，T02 审计和逐节批准无未完成项。
- [ ] 清空 `guiding.md`，不得删除该文件。
- [ ] 本提交不得夹带 `SPEC.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md` 或其他文件改动。

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
git commit -m "docs: 清空T02任务规划"
```

**提交后分支动作：**

```powershell
git log --oneline dev..HEAD
git diff --check dev...HEAD
git status --short
```

预期：T02 的规划与清空提交均保留，工作区干净，可以推送并创建 `docs/t02-requirements-spec -> dev` 的 MR；禁止 squash。

---

## T02 完成判定

只有同时满足以下条件，才可合并 T02；T02 合入 `dev` 后才能从最新 `dev` 创建 T03 独立分支：

- [ ] `SPEC.md` 覆盖通用要求和 A 方向全部必填内容。
- [ ] 至少五个 INVEST 用户故事，全部功能模块具有完整契约和客观验收。
- [ ] 六维 Harness 最低机制、主要贡献和三项演示均明确由代码实现并可离线确定性测试。
- [ ] 架构、数据模型、状态机、信任边界和外部依赖内部一致。
- [ ] 凭据威胁模型、安全存储、分发、WebUI、GitLab CI 和线上部署方案完整。
- [ ] 风险与未决问题具有明确的处理阶段和保守默认行为。
- [ ] 项目负责人逐节阅读并批准，`SPEC_PROCESS.md` 保留采纳、拒绝和修改证据。
- [ ] G1 设计确认通过；全程未创建实现代码、测试代码或工程配置。
- [ ] `guiding.md` 已通过独立末尾提交清空，MR 禁止 squash。
