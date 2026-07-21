# AI4SE Coding Agent Harness 开发日志

## 文档用途

本文件按时间顺序记录项目中的任务、使用的 Superpowers Skill、关键 prompt 与 context、智能体产出、人工干预、提交证据和经验。记录必须与实际过程同步，不得事后补写虚假过程；尚未发生的动作必须明确标注为计划或待执行。为提高作业文档的可读性，项目负责人的口语化发言可以在不改变语义和决策的前提下整理，并明确标注为“整理后的表述”；不得把润色扩展为不存在的事实或决定。

## 记录格式

每条记录包含：

- 时间与任务编号
- 分支与基线提交
- 开发环境与使用的 Skill
- 关键 prompt / context 边界
- 智能体产出与人工决策
- 提交或验证证据
- 经验与下一步

## 时间线

### 2026-07-16 10:59:23 +08:00 · T01 启动

- 分支：`docs/t01-spec-design`
- 基线提交：`7c62c0c`（`docs: 规划T01需求探索步骤`）
- 主开发环境：OpenAI Codex App
- Superpowers：已启用；本地插件路径显示版本为 `6.1.1`，技能来源位于 `C:\Users\32175\.codex\plugins\cache\openai-curated-remote\superpowers\6.1.1\skills\`。
- 本轮使用的 Skill：`using-superpowers`、`brainstorming`。`brainstorming` 已触发，目前正在进行项目上下文探索并准备逐问逐答。
- 初始 prompt（整理后的表述）：`请阅读根目录的 guiding.md，并由当前对话负责完成 T01 的需求探索、过程记录与分支收尾。`
- 前置 context：用户先要求阅读 `guide/` 以理解项目目的，并明确忽略 `guiding.md`；随后在本轮授权读取 `guiding.md`，指定本对话负责 T01。
- context 边界：本轮只进行需求探索、过程记录和设计决策；禁止创建工程骨架、依赖配置、测试代码或任何业务实现。
- 当前人工决策：选择 A 方向 Coding Agent Harness；具体产品边界、目标用户、核心场景和主要贡献维度尚未确认。
- 已完成事实：检查了 `guiding.md`、根目录文件、Git 分支、工作区状态和近期提交；确认当前分支正确、提交 1 已存在、仓库尚无实现文件。
- 下一步：建立 `SPEC_PROCESS.md` 记录骨架后，通过角色化访谈推演目标用户的工作方式与痛点，再由项目负责人审阅设计结论。

### 2026-07-16 11:13:49–12:00:56 +08:00 · T01 模拟目标用户访谈与负责人审阅

- Skill：`brainstorming`
- 方法：AI 扮演“小型项目开发团队成员”进行角色化访谈推演；模拟回答在 `SPEC_PROCESS.md` 中明确标注，不作为真实外部用户调研数据。
- 模拟用户画像：成员分别使用 Codex、Claude Code 等 Coding Agent，通过 Git / MR / CI 汇合工作成果。
- 关键问题：需求、历史决策与上下文分散在不同成员的 Agent 会话中，导致新改动可能违背旧设计约束，通常直到 MR 汇合阶段才暴露。
- 代表场景：配置与环境变量契约变更、并行任务使用不同决策版本、新成员或新 Agent 冷启动。
- AI 建议：将泛化的“共享上下文”收敛为“结构化决策记录、版本化上下文快照、确定性冲突检查与 HITL”。
- 项目负责人审阅：确认面向小型项目开发团队，批准三个场景、30 秒价值陈述、现成 Coding Agent 的结构性缺口和非目标。
- 人工修改：要求 Harness 在契约冲突时暂停并请求审批；发现决策版本过期时展示差异、刷新上下文并重新规划。
- 设计变化：项目从泛化 Coding Agent Harness 收敛为“决策感知型 Coding Agent Harness”，把设计冲突从 MR 阶段前移到 Agent 行动之前。
- 提交计划：完成验证后，使用 `docs: 明确项目价值与使用边界` 提交。

### 2026-07-16 12:12:22 +08:00 · T01 模拟机制访谈

- Skill：`brainstorming`
- 方法：AI 扮演目标团队成员，推演 Agent 能力边界、六维最低机制、权限策略、记忆和确定性验证；模拟回答明确记录在 `SPEC_PROCESS.md`。
- 关键 context：已确认的目标用户、三个场景、30 秒价值陈述和非目标；不引入实现代码或技术依赖。
- AI 产出：自研决策主循环、六类最小工具、三类传感器、`allow` / `ask` / `deny` 策略、结构化决策记忆、安全配置和脱敏 Trace。
- 人工边界：LLM 只提出动作；版本冲突、契约冲突、权限和停机必须由确定性代码控制。
- 设计修订：放弃“共享聊天摘要 + LLM 自行判断冲突”，改为结构化 `DecisionRecord`、版本化 `ContextSnapshot` 和确定性传感器。
- 验证思路：所有六维机制由脚本化 mock LLM、mock 工具和构造数据离线验证，不需要网络、真实模型或真实 key。
- 提交计划：验证后使用 `docs: 明确Agent能力与机制边界` 提交。

### 2026-07-16 12:14:23 +08:00 · T01 主要贡献方案评审

- Skill：`brainstorming`
- 比较方案：治理与 HITL、反馈闭环、版本化决策记忆与上下文。
- 评估维度：用户价值、机制深度、确定性可测性、实现风险、演示效果和项目周期。
- AI 建议：选择版本化决策记忆与上下文作为主要贡献；治理和反馈保留为可运行的基础机制。
- 选择理由：该方向直接对应跨成员、跨会话决策断裂，能用确定性的版本、范围、快照和冲突规则形成差异化。
- 拒绝治理为主：容易退化为通用安全网关，偏离目标用户首要问题。
- 拒绝反馈为主：测试失败回灌已有较成熟范式，产品差异化不足。
- 成功证据：固定决策历史与任务输入下，快照可复现、过期可阻断、冲突可结构化、重基线可验证，全部由 mock 离线测试完成。
- 提交计划：验证后使用 `docs: 记录主要贡献方案决策` 提交。

### 2026-07-16 14:36:16 +08:00 · T01 最终批准与证据审计

- Skill：`brainstorming`、`verification-before-completion`
- 项目负责人确认（整理后的表述）：批准 T01 设计；本分支仅完成 T01，不处理 T02，并以独立的最后提交清空 `guiding.md`，确保提交历史清晰且便于后续合并到 `dev`。
- 最终决策：批准“决策感知型 Coding Agent Harness”定位，主要贡献为版本化决策记忆与上下文。
- 提交证据：
  - `7c62c0c`：`docs: 规划T01需求探索步骤`
  - `1f988ac`：`docs: 建立项目过程记录`
  - `378a87f`：`docs: 明确项目价值与使用边界`
  - `332b1cc`：`docs: 明确Agent能力与机制边界`
  - `3c56562`：`docs: 记录主要贡献方案决策`
- 审计结果：`SPEC_PROCESS.md` 包含三轮关键迭代、三个使用场景、三个候选方案、六维最低机制和确定性验证思路；根目录仅新增 `AGENT_LOG.md` 与 `SPEC_PROCESS.md`，未出现实现源码、工程骨架、依赖配置或测试代码。
- 人工边界：本对话不处理 T02，不创建 `SPEC.md`；审计提交之后只清空 `guiding.md`。
- 下一步：创建 `docs: 完成T01需求探索审计`，随后以独立末尾提交 `docs: 清空T01任务规划` 收尾。

### 2026-07-16 16:34:39 +08:00 · T02 产品需求与用户故事

- 分支：`docs/t02-requirements-spec`
- 基线提交：`4410641`（`docs: 规划T02需求规约步骤`）
- Skill：`using-superpowers`、`brainstorming`
- context：完整读取 `guide/`、T02 `guiding.md`、T01 的 `SPEC_PROCESS.md`、`AGENT_LOG.md` 和近期提交；未创建实现文件。
- 人工确认：批准 TypeScript 全栈、SQLite 单实例边界、加密凭据库、人工登记与 Agent 提议的决策入口，以及后续集中询问的全部默认设计。
- 本阶段产出：创建 `SPEC.md` 的文档控制、问题陈述、角色、三个场景、价值、目标、成功信号、非目标、术语和九条 INVEST 用户故事。
- 真实性边界：T01 模拟访谈不作为外部调研；规约只把可重复机制行为写成验收信号。
- 下一步：完成模块化功能规约，不进入实现。

### 2026-07-16 · T02 模块化功能规约

- 分支：`docs/t02-requirements-spec`
- 上一提交：`145e98c`（`docs: 编写产品需求与用户故事`）
- context：只使用已批准设计、T02 规划和课程硬性要求；未选择实现目录或编写代码。
- 产出：为决策版本、范围选择、快照、任务运行、Rebaseline、冲突审批、工具反馈、Trace 和凭据九个模块定义完整契约。
- 人工边界：确认结构化约束参与自动判断，自然语言只供人和 LLM 阅读；确认重启后不自动重放副作用。
- 验证重点：每个模块均包含输入、行为、输出、边界条件、错误处理、验收和依赖。
- 下一步：将功能契约映射到 Harness 六维机制与三项强制演示。

### 2026-07-16 · T02 领域与 Harness 机制设计

- 上一提交：`a0dbd61`（`docs: 完善功能模块规约`）
- 产出：定义 coding 领域四类机制、六维最低代码实现、自研边界、单次 LLM 抽象、主要贡献和离线验证矩阵。
- 人工确认：批准模块化单体解释；前端经 HTTP/SSE 调用后端，后端内部模块化，生产可由同一 Fastify 服务提供前端静态文件。
- 三项演示：危险动作拦截、失败驱动修正、旧快照阻断与 Rebaseline。
- 安全边界：LLM 只提出 Action，代码负责权限、冲突、反馈和停机；不调用现成 Agent Runner。
- 下一步：定义系统架构、接口、实体、状态机与信任边界。

### 2026-07-16 · T02 系统架构与数据模型

- 上一提交：`2c10e81`（`docs: 完善领域与机制设计`）
- 方案比较：模块化单体、双进程 Worker、事件驱动服务；人工批准模块化单体。
- 产出：组件图、主数据流、过期/冲突流、核心接口、同步/异步边界、六类信任边界和外部依赖降级策略。
- 数据：定义决策、快照、运行、动作、工具、反馈、审批、Trace、凭据和用户实体；补充关系图与三类状态机。
- 人工确认：前后端逻辑分离，生产单容器；SQLite 只支持单实例低并发写入，未来通过 Repository 接口迁移。
- 下一步：定义可测量的非功能需求和完整凭据威胁模型。

### 2026-07-16 · T02 非功能需求与凭据安全

- 上一提交：`c998f40`（`docs: 定义系统架构与数据模型`）
- 产出：性能、可靠性、安全、可用性、可观测性、兼容性和资源的可测要求；凭据资产、攻击者、入口、存储、生命周期和威胁应对矩阵。
- 加密决策：AES-256-GCM；本地主密码使用 Argon2id 派生，容器/线上使用 Secret 注入随机主密钥。
- 人工确认：学校 API Key 可用于手动集成和 smoke test，但不得进入代码、聊天、Git、CI、日志或核心测试。
- 保守行为：数据库、Trace、Git 状态、主密钥或外部供应商不可用时明确失败或降级，不伪装成功。
- 下一步：确定技术组件、WebUI、分发、GitLab CI 和部署约束。

### 2026-07-16 · T02 技术、分发与部署方案

- 上一提交：`1976ee6`（`docs: 明确非功能需求与凭据安全`）
- 人工批准技术栈：TypeScript、Node.js、Fastify、React/Vite、SQLite/Drizzle、Zod、Vitest、Playwright、Open Design、SSE。
- Provider：核心使用脚本化 mock，首个真实适配器为 OpenAI-compatible 单次调用。
- 分发：Docker/OCI 单容器为主，本地 Node.js 开发运行为辅；持久化 `/data`、受限 `/workspace` 和独立 Secret。
- CI：采用南京大学 GitLab；`.gitlab-ci.yml` 必须包含名称精确为 `unit-test` 的离线 job，并包含 lint、类型、凭据、集成、e2e 和构建检查。
- 部署：具体平台延后至 T19，保守默认是不部署、不上传学校 Key；平台必须满足持久卷、HTTPS、Secret、限额和单副本。
- 下一步：建立需求追踪矩阵、风险与未决问题，然后做规约审计。

### 2026-07-16 · T02 验收、风险与决策点

- 上一提交：`aac953d`（`docs: 确定技术分发与部署方案`）
- 产出：25 条需求追踪项，覆盖通过/失败条件、验证层级、真实依赖和未来任务；显式映射 T01 六条成功判据。
- 风险：登记范围匹配、冲突爆炸、存储增长、Rebaseline 循环、跨平台隔离、符号链接、凭据兼容、信任边界、LLM/传感器、Trace、成本、周期和演示风险。
- 未决事项：公网平台、Registry、具体依赖版本、Open Design 主题、生产 Secret 来源和学校 Provider 参数均有截止阶段与保守默认。
- 人工边界：具体部署继续留到 T19；未选平台前不部署、不上传学校 Key。
- 下一步：执行占位符、矛盾、范围和一致性自审，形成 T02 批准版本。

### 2026-07-16 16:53:08 +08:00 · T02 逐节批准与规约审计

- Skill：`brainstorming`、`verification-before-completion`。
- 项目负责人结论：此前集中询问的设计全部同意，并逐节确认当前规约；第 1–12 节批准，G1 通过，但不授权进入实现。
- 提交 1–8：`4410641` 规划步骤、`145e98c` 产品需求、`a0dbd61` 模块规约、`2c10e81` 领域机制、`c998f40` 架构数据、`1976ee6` 非功能安全、`aac953d` 技术分发、`501357d` 验收风险。
- 一致性审计：九条用户故事对应九个模块；25 条需求均含通过/失败条件、验证层级和未来任务；T01 六条成功判据全部映射；九个模块均含输入、行为、输出、边界、错误、验收和依赖。
- 范围审计：相对 `dev` 仅涉及 `SPEC.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md` 和任务期内的 `guiding.md`；没有源码、工程骨架、依赖或测试实现。
- 验证证据：`SECTIONS=12 STORIES=9 MODULES=9 MODULE_TEMPLATES=9 REQUIREMENTS=25 MERMAID=8 T01_MAPPING=6`；占位符扫描无命中；`git diff --check` 无输出。
- 人工干预：确认 SQLite 的适用边界、学校 Key 的测试边界、部署延期、前后端逻辑分离与单容器不矛盾，并批准其余默认设计。
- 自审修订：规范约束值类型，澄清 Action 生命周期，移除决策状态图自循环；这些修改消除歧义，不扩大需求范围。
- 下一步：提交批准版本，然后以独立提交只清空 `guiding.md`；T03 必须从最新 `dev` 调用 `writing-plans` 开始。

### 2026-07-16 · T03 启动与计划框架

- 分支：`docs/t03-implementation-plan`；基线：`9e30e18`（T02 已合入 `dev`）。
- Skill：`writing-plans`；初始 prompt（整理后的表述）：`根据 guiding 来完成 T03 的任务`。
- context：完整读取 T03 `guiding.md`、`SPEC.md` 1.0.0、`SPEC_PROCESS.md`、`AGENT_LOG.md` 和分支历史；未读取无关实现，因为仓库尚无实现文件。
- 范围：只生成根目录 `PLAN.md` 并同步过程证据；G3 通过前禁止创建源码、测试、依赖、Dockerfile 或 CI。
- 提交 1：`8b5510b`（`docs: 规划T03实现计划步骤`）。
- 计划决策：采用模块化单体文件地图，冻结核心类型、状态机、Clock/ID/Hasher 注入和单一脱敏入口；拒绝大型混合文件与过早微服务化。
- 下一步：按 T05–T20 分组补充精确路径、接口、红绿测试、命令、提交、MR 与 Gate。

### 2026-07-16 · T03 规划 T05–T07

- 上一提交：`2aeb0f5`（`docs: 建立实现计划框架`）。
- 产出：T05 工程骨架、T06 `LLMProvider`/`ScriptedMockLLM`、T07 Action/Registry/Dispatcher 的精确文件、接口、测试代码、红绿命令和完成标准。
- 人工边界沿用：`OPEN-03` 的依赖版本只在 T05 基于当时受支持 LTS 由负责人批准；T03 不猜测版本。
- 关键决定：继续使用 SPEC 的 `LLMProvider` 名称，避免同时出现 LLMClient；T07 只完成确定性分发，不越界实现治理和循环。
- 验证：计划明确核心测试离线、参数错误零调用、异常输出脱敏，以及 T05 → T06 → T07 串行合并。

### 2026-07-16 · T03 规划 T08–T10

- 上一提交：`a30658c`（`docs: 规划工程基础与工具分发任务`）。
- 产出：受限文件/命令、Policy/HITL、反馈传感器的精确接口、攻击测试、红绿步骤和合并顺序。
- 人工边界沿用：deny 不可覆盖；审批有效期 15 分钟；命令 120 秒/64 KiB；连续失败 3 次升级；不自动重试副作用。
- 一致性修订：只使用 SPEC 的五类 FeedbackResult；guiding 中额外术语作为外部映射，不新增领域状态。
- 验证重点：工具调用为零、文件字节不变、审批并发恰一消费、环境错误不伪装业务失败。

### 2026-07-16 · T03 规划 T11–T13

- 上一提交：`99b5bb8`（`docs: 规划工具治理与反馈任务`）。
- 产出：决策/范围/快照/Rebaseline、配置/脱敏/Trace/SSE、自研 Agent Runtime 的精确任务和 G4 命令。
- 关键路径：T11 → T12 → T13；理由是三者共享 DB Schema、状态机、Trace DTO 和绑定语义。
- 主要贡献证据：顺序/变形测试、并发激活、SHA-256 指纹、旧绑定失效和结构化 diff 全部离线验证。
- 安全证据：fake Key 跨通道扫描、Trace 先持久化后 SSE、重启不重放、副作用前 stale/Policy。

### 2026-07-16 · T03 规划 T14–T16

- 上一提交：`a718cd7`（`docs: 规划上下文追踪与主循环任务`）。
- 产出：主要贡献深度测试、三项强制演示、可信 WebUI/API/SSE 的原子步骤与 G5 证据。
- 深度纪律：用 mutation/fault injection 证明测试有效，不通过新增通用 Agent 功能堆叠代码量。
- 演示纪律：一个离线命令、失败非零、连续三次一致，无演示专用生产分支。
- UI 纪律：后端唯一裁决、DTO 白名单、断线无假成功、键盘流程和严重 a11y 错误为零。

### 2026-07-16 · T03 规划 T17–T20

- 上一提交：`051775a`（`docs: 规划主要贡献演示与界面任务`）。
- 产出：凭据/Provider、GitLab CI、Docker/线上部署、最终文档与审计的精确步骤和 G6/G7 证据。
- 凭据边界：Argon2id + AES-GCM + Secret 分离；fake Key 全通道测试；真实调用仅受控 smoke。
- 交付边界：平台能力不足时保守不部署；CI 失败不可 `allow_failure`；最终历史问题只能人工批准处置。
- 终态：T20 需要 `dev → main` MR 后 `main` 最新 Pipeline passed，才可宣称 G7。

### 2026-07-16 · T03 依赖与并行审查

- 上一提交：`70405bb`（`docs: 规划安全分发与最终交付任务`）。
- 产出：T05–T20 DAG、关键路径、开始/阻塞/输出表、文件冲突矩阵、16 个 branch/worktree/MR 和最小 context 规则。
- 并行结论：主链串行；T12 纯 redactor、T14 测试与 T16 页面原型仅在接口冻结后有限并行；共享文件变化立即转串行。
- 评审门：先 Spec 合规、再代码质量，Critical 修复复查后才可 MR。
- 覆盖结论：25 条需求、9 个用户故事、全部 NFR、3 演示、6 open decision 均有任务位置；T04 不被误列为实现任务。

### 2026-07-16 17:54:49 +08:00 · T03 技术自审与 G2 前置检查

- 提交 1–8：`8b5510b`、`2aeb0f5`、`a30658c`、`99b5bb8`、`a718cd7`、`051775a`、`70405bb`、`b4e5c23`，顺序与 `guiding.md` 一致。
- 自审修订：展开 T08–T20 精确路径和验证命令，补齐 package/port/credential 类型归属，显式列出 US/DEMO/OPEN 编号。
- 计数证据：`TASKS=16 FILES=16 INTERFACES=16 DONE=16 BRANCHES=16 REQ=25 US=9 DEMO=3 OPEN=6`。
- 占位符扫描：`TBD|TODO|待补充|实现核心功能|完善测试|相关文件|implement later|fill in details` 无命中。
- 范围证据：`git diff --name-only dev...HEAD` 只列出 `AGENT_LOG.md`、`PLAN.md`、`SPEC_PROCESS.md`、`guiding.md`；工作区的提交 9 候选改动也仅为上述文档。
- 人工干预：尚无；必须由项目负责人阅读生成后的 PLAN 并给出“批准”或修改意见，不能用最初的执行指令替代逐章批准。
- T04 移交：只提供 `SPEC.md` 和批准后的 `PLAN.md`；选择 1–2 个 Task 冷启动，任何不确定立即暂停，不得使用历史聊天补全。
- 当前状态：技术自审通过；等待负责人批准 G2。批准后记录时间/结论，提交 `docs: 确认项目实现计划`；下一独立提交只清空 `guiding.md`。

### 2026-07-16 18:02:22 +08:00 · T03 项目负责人批准

- 人工干预：项目负责人明确回复“批准”，确认生成后的 `PLAN.md`，不是沿用任务开始前的推定授权。
- 批准范围：T05–T20、需求覆盖、接口/文件地图、TDD/验证、DAG、关键路径、并行/冲突、branch/worktree/MR/Pipeline 和 T04 冷启动约束。
- 结论：`PLAN.md` 晋升为 1.0.0，G2 通过；G3 仍未通过，禁止开始实现。
- 下一步：验证并提交 `docs: 确认项目实现计划`，随后以独立提交只清空 `guiding.md`。

### 2026-07-16 23:52:23 +08:00 · T04 启动与主控预审修订

- 独立分支：`docs/t04-cold-start-validation`，从 `dev` 的 `c29fd17` 创建；未共用 T03 分支。
- 提交 1：`67fabf3 docs: 规划T04冷启动验证步骤`，只建立 T04 的提交级 `guiding.md`。
- 预审来源：主控复核已批准的 T03 `PLAN.md`；本轮尚未启动陌生智能体，也没有提供历史聊天或额外上下文。
- 修订内容：修正 T13 G4 的未声明测试路径，展开 T15 三项演示测试路径，并将复合 Step 拆成显式 2–5 分钟的单一可验证动作。
- 版本状态：`PLAN.md` 由 1.0.0 修订为 1.0.1；用户已授权先修复 T03 问题，G2 保持通过，G3 仍未通过。
- 范围边界：只修改 `PLAN.md`、`SPEC_PROCESS.md`、`AGENT_LOG.md` 和 `guiding.md`；不修改 `SPEC.md`，不创建源码、测试、依赖、Dockerfile 或 CI。
- 验证约定：扫描两个已知错误路径、统计显式 Step、检查 Task 内编号重复与复合动作、执行 `git diff --check`，并核对提交候选文件范围。
- 计划提交：`docs: 修正实现计划执行歧义`；提交后再由专门的 T04 对话执行输入冻结和冷启动试做。

### 2026-07-17 · T04 冷启动协议与冻结证据

- 当前动作：创建 `COLD_START_VALIDATION.md`，只记录协议、完整原始 prompt、输入证据和待执行模板；尚未启动 Gemini 全新会话，未伪造模型截图、试做结果、问题、命令或产物。
- 智能体类型：主开发为 OpenAI Codex App；陌生智能体目标为 Google Gemini 网页版。二者供应商及产品类型不同。用户当前称网页界面为“Gemini 3.5 Flash”，但完整模型名称必须在执行当天按网页实际显示核验并留证，当前状态为待验证。
- 全新会话规则：新建空会话，不使用历史或 memory；执行时记录验证时间、检查方法、实际模型名称和截图。若 memory/个性化无法关闭或确认，则暂停并记为环境缺口。
- 输入证据：提交 `b337e5ef3decb6f71a5216922f94feee05c3b2d0`；`SPEC.md` blob `5bc380d4bf5854a07d0f65e06c517ffaa81cfd66`、SHA-256 `a22e11b49d489ac81d7dbfa08d8c3746a89669d6fedfaba0d42a2e88f19c2f6f`、1305 行；`PLAN.md` blob `8690e3bd56894fffd7b64d4c5b2ed6c253ac2b38`、SHA-256 `1f88a5f9b36634200ece0198cf9dcae611cc0cd1fef918475b700c498c378a94`、1174 行。
- 输入清单：严格只有冻结的 `SPEC.md` 和 `PLAN.md`；无仓库、历史聊天、memory、额外文件、口头补充或 API key。
- Prompt 约束：陌生智能体自行选择 1–2 个 PLAN Task 并说明理由；不确定时立即暂停、逐条提问、不得猜测。若网页缺少终端或仓库，必须如实报告实际工具并将缺失能力视作环境缺口，不能伪造执行结果。
- 隔离与产物：试做只在 Gemini 网页新会话中进行，不把试做源码合入当前分支；后续仅保存对话、截图、文本/附件、原始问题和只读 diff 等证据。
- G3 状态：未通过；首次试做、问题分类、文档修订和复验均留待后续独立提交。

### 2026-07-17 · T04 陌生智能体首次试做证据

- 分支与基线：`docs/t04-cold-start-validation`；基线提交 `3e54525`。
- 陌生智能体与界面：Google Gemini 网页版。截图 1（2026-07-17 23:33:16 +08:00）显示空白新对话页面；截图 2（2026-07-17 23:34:41 +08:00）显示附加 `PLAN` 与 `SPEC` 文件。两张截图可见模型标签均为“Flash”，没有核验完整模型名称，不能写成已验证的“Gemini 3.5 Flash”。
- memory/个性化：截图没有证明 memory、个性化或已保存信息已关闭；不据此宣称“无 memory”。
- 输入事实并列记录：截图 2 显示附加 `SPEC` 与 `PLAN`；Gemini 原始回复同时称“SPEC.md（未直接上传）”。本提交不判断两项事实何者为准。
- 原始环境自述：Gemini 回复列出可用工具 `personal_context:retrieve_personal_data`，并称本轮未消费；列出本地文件读写、`bash`/终端命令执行和 Git 仓库操作为不可用。该记录保留为原始环境事实，未独立推定其他能力。
- 试做选择与暂停：Gemini 选择 T05，理由为依赖序位最前及用于暴露规约缺陷；在 T05 Step 1 记录两个暂停点：G3 闸口与试做冲突、OPEN-03 依赖版本批准。回复报告已完成步骤“无”、未完成 T05 Step 1 至 Step 20、命令“未执行”、停止原因为环境限制和 G3/OPEN-03、产物或 diff 为“无”。
- 时间边界：真实发送时间、响应开始时间和响应结束时间未直接记录。截图文件元数据及 SHA-256、Codex 收到证据时间（2026-07-17 23:36:36 +08:00）已记录于 `COLD_START_VALIDATION.md`。
- 人工干预：首次试做结束前没有向陌生智能体提供已知答案或绕过疑问的引导；本提交仅保存原始事实，未进行结果分类或修订 `SPEC.md`、`PLAN.md`。

### 2026-07-17 · T04 冷启动发现分类

- 前置提交：`325ab7f docs: 记录冷启动试做证据`。
- 新增证据：用户在同一 Gemini 会话、同一冻结 SPEC/PLAN 上重新生成了一次回复；没有新增截图、独立时间或 memory/模型证据，故只作为补充样本，不替代首次回复，不计为独立复验。
- 真实缺陷：`PLAN.md` 要求 T04 试做 Task，同时禁止 G3 前实现，但未明确定义隔离的一次性草案/模拟执行与正式实现的边界。两份回答分别“Step 1 完全停止”和“生成 health.ts 草案”，证明该歧义会阻塞或分叉新鲜智能体行为。
- 智能体误读：OPEN-03 的批准者已有明文；runtime/infrastructure package 分别属于 T06/T08；G3 禁止项不限业务代码；截图显示 SPEC 附件但模型称未直接上传。均保留证据，不通过修改正确规约迁就误读。
- 环境缺口：没有终端、Git、写入和命令执行能力；`personal_context` 可用而 memory/个性化关闭未证明；页面仅显示“Flash”。本轮可用于发现 PLAN 歧义，但不能作为完全合格冷启动或 T05 实现证据。
- 产物差距：没有正式文件、根脚本、测试 RED/GREEN、命令退出码、锁文件、提交、Pipeline 或 MR；`health.ts` 只是消息内文本草案。
- 修订决策：仅将 PLAN 冷启动边界列入提交 6 候选；拒绝向 T05 追加未来包、拒绝提前猜 OPEN-03 版本、拒绝修改无证据缺陷的 SPEC。G3 保持未通过，等待负责人批准修订方向并完成同 Task 独立复验。

### 2026-07-18 00:01:24 +08:00 · T04 冷启动边界修订

- 人工干预：项目负责人回复“无需逐个批准，直接做完”，统一批准此前提出的提交 6 修订方向和 T04 后续步骤。
- 证据驱动修改：`PLAN.md` 从 1.0.1 升为 1.0.2；明确 T04 可在不连接项目工作区的外部网页/一次性沙箱静态推演，并在回答正文中保留一次性文本草案或失败证据。
- 禁止边界：任何试做内容不得写回项目工作区、安装为依赖、提交、合并或计入 T05–T20 进度；G3 前正式源码、测试、依赖、Dockerfile 和 CI 禁令不变。
- 不变项：T05 文件/接口/步骤、T06/T08 package 归属、OPEN-03 决策责任、依赖 DAG、REQ/US/DEMO 和产品架构均不变。
- SPEC 处置：没有证据支持需求或架构缺陷，故 `SPEC.md` 保持 1.0.0，不更新版本或追踪矩阵。
- Gate：G2 保持通过，G3 仍未通过；下一步用修订后的 SPEC/PLAN 在另一个全新会话复验同一 T05，不提供修订说明。

### 2026-07-18 00:49:53–01:10:56 +08:00 · T04 OpenCode 复验与返工

- 隔离环境：`C:\Users\32175\AppData\Local\Temp\t04-opencode-revalidation-20260718` 中仅有修订后的 `SPEC.md`、`PLAN.md`；OpenCode 1.17.14；三次会话导出均为 0 additions、0 deletions、0 files。
- 尝试 1：`ses_08f03f66dffeJnBe9f6pGH5o3O`，`njusehub/deepseek-v4-pro`；模型选择 T06/T07 而非同一 T05，随后上下文压缩失败，没有完整结束总结。
- 尝试 2：`ses_08efb4523ffekja4k7u1f9gF6J`，`njusehub/deepseek-v4-pro`；提示已收窄为 T05 Step 1–5，但自动摘要阶段调用 `grep`，真实错误为 `Tool call not allowed while generating summary: grep`，未形成最终结果。
- 尝试 3：`ses_08ef90b87ffeUzAeq1y4WeMmkU`，`njusehub/DeepSeek-R1`；通过 `grep`、`read` 检索必要片段，完成 T05 Step 1–5 文本推演，未写文件、未执行 pnpm/Vitest。另有两次不可用工具 `อ่าน` 调用，均返回 invalid tool。
- 复验判断：第三次回复最终仍把 G3 边界视为 Step 1 冲突，把 `.js` 导入与 `.ts` 源文件视为路径冲突，并在思考中示例未经批准的 Node `v20.5.0`。因此 1.0.2 复验未通过，提交 7 验收项保持未勾选。
- 返工：PLAN 升为 1.0.3，只补强 T04 模拟 Step 1–5 的 Gate/OPEN-03 语义和 TypeScript ESM 导入说明；SPEC 1.0.0、T05 文件归属、OPEN-03 决策责任和产品范围不变。
- 人工停止：项目负责人明确不再运行外部模型。本轮如实停止，不伪造 1.0.3 复验；若未来开放 T05，须先补做同 Task 独立复验或明确记录接受剩余风险。
- Gate：G2 保持通过；G3 未通过；禁止开始 T05 正式实现。

### 2026-07-18 01:33:39 +08:00 · T04 最终审计与 G3 批准

- 提交链审计：`67fabf3`、`b337e5e`、`3e54525`、`325ab7f`、`3c6c038`、`040d9ae`、`80c3535` 按顺序记录了规划、预审修订、协议、原始证据、分类、PLAN 修订与失败复验返工。
- 验证环境：Gemini 网页首次试做及 OpenCode 1.17.14 隔离目录复验均已记录；三次 OpenCode 尝试没有成功闭环，0 文件变更。失败事实未被改写。
- 人工干预：项目负责人明确要求简化流程、不再重复外部模型复检，并在审阅现有证据后接受剩余冷启动误读风险、批准 G3。
- 经验：外部模型复验是发现歧义的证据来源，不应成为无限重试门槛；当修订、失败证据、范围边界均可追溯时，负责人可以显式接受剩余风险，但必须保留未通过事实。
- Gate：G2、G3 已通过。T04 分支仍只含文档；T05 必须在 T04 合入 `dev` 后从最新 `dev` 创建独立分支/worktree。OPEN-03 未批准前，不得安装依赖或创建工程骨架。
- 下一步：提交本次审计；随后以独立提交只清空 `guiding.md`，再将本分支合入 `dev`，禁止 squash。

### 2026-07-18 · T05 工程骨架、验证与范围审计

- 分支与提交：`chore/t05-project-foundation` 从含 `0b03b78` 的最新 `dev` 创建；完整 T05 基线提交链固定为 `f5cdbca..decc79a`（5 条）：`f5cdbca`（规划）、`fbd796d`（工程骨架）、`3d70dd4`（最小健康测试）、`53ef325`（验证记录）和 `decc79a`（清空规划）。其中主实现提交为 `fbd796d` 与 `3d70dd4`。MR 尚未创建，Pipeline 尚未触发。
- OPEN-03 决策：项目负责人已批准 Node 24 LTS、pnpm `11.14.0`、TypeScript `6.0.3`、Fastify `5.10.0`、React/react-dom `19.2.7`、Vite `8.1.5`、Vitest `4.1.10`、ESLint `10.7.0`、`@eslint/js` `10.0.1`、`typescript-eslint` `8.64.0`。TypeScript 固定为 `6.0.3` 的根因是 `typescript-eslint@8.64.0` 的 peer 范围为 `>=4.8.4 <6.1.0`，故不采用不兼容的 `7.0.2`。
- Task 2 证据：以 Codex Node `24.14.0` 与 pnpm `11.14.0` 完成冻结安装；锁文件 SHA-256 安装前后相同；`test`、`lint`、`typecheck`、`build` 均通过。独立 Spec 合规与代码质量评审均通过，无 Critical 或 Important 问题。
- Task 3 RED/GREEN：先只创建测试，目标模块缺失导致 `Cannot find module '../../../apps/api/src/health'`；随后加入纯 `healthStatus()` 后，目标测试及四个根命令通过。独立评审结论为无问题，且未引入 Fastify 路由、服务启动或 T06+ 行为。
- 环境差异：系统默认 Node `20.19.4` 无法运行 pnpm `11.14.0`（缺少 `node:sqlite`）；最终验证显式使用 Codex Node `24.14.0` 与 pnpm `11.14.0`。受限沙箱中 Vite 配置加载会因子进程限制报 `spawn EPERM`，同一环境的控制器非沙箱代跑与本次非沙箱复验均通过，故不作为项目失败记录。
- 最终验证：`pnpm test`（1/1 通过）、`pnpm lint`（退出码 0）、`pnpm typecheck`（API/Web `tsc --noEmit` 通过）、`pnpm build`（Vite `8.1.5` 构建 14 个模块成功）、`git diff --check`（退出码 0）与 `git status --short`（无输出）均通过。
- 轻量审计：固定检查范围 `0b03b78..decc79a`，其中包含 5 条 T05 提交和 23 个端点变更文件；范围包括 `.gitignore`、`PLAN.md`、`AGENT_LOG.md`、`guiding.md`、根配置、最小 API/Web/共享包、健康函数与测试。无 Decision、Runtime、Policy、工具、数据库、Fastify 路由或服务启动行为。`git ls-files` 未列出 `.superpowers/`、`node_modules/`、`dist/` 或 `.env`；提交差异未发现真实 API Key、token、密码或私钥，文档 SHA 与 `git log` 一致。

### 2026-07-18 · T05 最终工程门禁修正

- 修正范围：将根 `@types/node` 精确固定到 `24.13.3`，并使用 Node `24.14.0` 与 pnpm `11.14.0` 更新锁文件；避免 Node 26 类型定义放宽 Node 24 目标平台的 API 边界。
- 类型与构建门禁：API 改为 NodeNext ESM 并实际包含 `src/**/*.ts`，新增独立 `typecheck`、产物构建；根 `typecheck` 覆盖 API、Web、domain、shared 和 tests，根 `build` 同时构建 API 与 Web。domain/shared/tests 均拥有最小 TypeScript 配置。
- 健康契约：测试使用 TypeScript ESM 的 `../../../apps/api/src/health.js` 说明符，并以静态断言锁定 `healthStatus(): { status: "ok" }`；先观察到 `{ status: string }` 不满足字面量契约的 RED，再以显式返回类型获得 GREEN。
- 忽略与测试门禁：移除 Vitest 的空测试放行；SQLite 忽略规则增加 `*.db-*`、`*.sqlite-*`、`*.sqlite3-*` sidecar 覆盖。最终验证记录见本地忽略的 `.superpowers/sdd/final-fix-report.md`。

### 2026-07-18 · 一周最小交付重规划

- 人工决策：项目负责人认为原 T05–T20 计划无法在可接受时间内完成，明确要求一周内取得最低课程作业结果、总体任务最多到 T12、T06–T12 每个任务最多 6 个提交，并删除无新增信息的重复复检。
- 保留硬项：自实现 agent loop、真实 OpenAI 兼容 API、mock LLM 确定性测试、工具、记忆、治理、反馈、配置、机制演示、CI、分发、README、反思和在线 WebUI。
- 核心删减：数据库、多用户、SSE、复杂审批/决策状态机、向量检索、线上后端、Docker/DinD、企业级凭据设施、性能与故障矩阵以及原 T13–T20。
- 交付选择：真实学校 API 只在本地 Harness 使用；CI 与静态 WebUI 使用 mock。在线 URL 采用 GitLab Pages，不要求服务器权限。
- 流程偏离：每个 Task 仍保留一次 Spec 检查和一次质量检查以满足课程最低过程要求，但取消重复独立复审；只让 Critical 阻断下一步。取消 guiding 首尾独立提交纪律，避免无价值提交。
- 计划基线：`PLAN.md` 升为 2.0.0，T05–T12 串行执行，目标完成日期 2026-07-25。

### 2026-07-18 · 项目结构简化

- 人工批准：项目负责人认为原 domain/shared/runtime/infrastructure 多包拆分过于零散，批准改为 `apps/web`、`apps/api`、`packages/harness`、`tests` 四区。
- 职责边界：Web 只负责 React 页面；API 只负责 Fastify、本地 CLI 和 Key 边界；Harness 包含全部 Agent 核心；tests 放跨模块验证。
- 依赖方向：`web → api → harness`；Web 不读取真实 Key，Harness 不依赖 React/Fastify。原空 domain/shared 合并为 harness，后续不再创建 runtime/infrastructure workspace 包。

### 2026-07-18 · T05 Node 24 类型依赖图修正

- 发现与边界：尽管根 `@types/node` 已固定为 `24.13.3`，Web workspace 未显式声明该类型包，导致 Vite `8.1.5` 与 `@vitejs/plugin-react` `6.0.3` 的 peer 实例仍解析到 `@types/node@26.1.1`。本轮只修正依赖图与记录，不新增业务行为。
- 修正：在 `apps/web` 显式精确固定 `@types/node` 为 `24.13.3`，用 Codex Node `24.14.0` 与 pnpm `11.14.0` 重建锁文件和本地依赖链接。锁文件中 `@types/node@26.1.1`、`@types/node: 26.1.1` 及 Node 26 的 Vite/plugin-react snapshot 均为零命中。
- 实例证据：`apps/web/node_modules/vite` 的 junction 指向 `vite@8.1.5_@types+node@24.13.3`，`@vitejs/plugin-react` 指向其 Node 24 peer 实例，`apps/web/node_modules/@types/node` 指向 `@types+node@24.13.3`。
- 验证：冻结安装、聚焦健康测试及根 `test`、`lint`、`typecheck`、`build` 全部通过；API `tsc --listFiles` 明确列出 `apps/api/src/health.ts`。完整命令与退出结果记录在忽略的 `.superpowers/sdd/final-version-fix-report.md`。

### 2026-07-18 · 课程最小范围对齐

- 当前分支：`docs/course-minimal-scope`，从 `dev` 的 T05 合并提交 `f014b42` 创建；本分支只修改权威文档，不实现 T06 功能。
- 用户目标：降低时间和 token 消耗，以“能运行、能演示、能提交”的暑期课程最低结果为准；明确选择方案 A，并要求不遗漏 `guide/` 原始作业硬项。
- Guide 输入：完整读取 A 类 Coding Agent Harness 专属要求和通用要求；`ADVANCED_LAB_PROJECT.md` 属于另一课后挑战项目，不作为本 Harness 的交付范围。
- 保留范围：决策封装、工具、记忆、治理、反馈、配置，自研循环，可注入 mock，反馈重点维度，三演示，安全凭据，真实 Provider 本地入口，CI、Pages、npm 分发、README、AGENT_LOG、SPEC_PROCESS 和本人反思。
- 删除范围：SQLite、多用户/RBAC、决策版本/Rebaseline、SSE、Docker、线上后端、多 Provider、性能/故障矩阵和浏览器 e2e。
- 一致性修复：SPEC 2.0.0 成为新权威范围；PLAN 2.1.0 与其对齐；Action 命令改为 executable/args；架构改为 API → Harness、Web 独立静态展示；T05 标记已合入 MR !6。
- 过程纪律：后续 T06–T12 每项最多 6 提交，仍保留独立分支/worktree、新鲜 subagent、一次 RED/GREEN、一次 Spec/质量检查、MR Pipeline 与记录；删除无新增信息的重复复检。
- 当前状态：只完成文档统一，尚未创建 T06 分支或实现 T06 代码。

### 2026-07-18 19:08:34 +08:00 · T06 最小决策与分发内核

- 分支与提交：在专用分支 `feat/t06-minimal-kernel` 执行；规划提交为 `b3dacb9`，RED 测试提交为 `e419138`，最小实现提交为 `c4eae99`。本记录提交与清空 `guiding.md` 的提交随后补齐，保持总计 5 个提交。
- 基线验证：在 Node `24.14.0`、pnpm `11.14.0` 和 `CI=true` 下，T05 基线的 `test`、`lint`、`typecheck`、`build` 全部通过；冻结安装前后锁文件未变化。受限沙箱内 Vite/Vitest 子进程出现 `spawn EPERM`，获准在同一工作区非沙箱执行后通过，属于环境限制。
- TDD 证据：先创建三个测试文件，聚焦运行得到 3 个文件、15 个用例失败；失败原因分别为 `parseAction is not a function`、`Dispatcher is not a constructor`、`ScriptedMockLLM is not a constructor`，符合“实现/导出尚不存在”的预期 RED。实现后同一命令为 3/3 文件、15/15 用例通过。
- 实现范围：新增四类严格 `Action`、单次 `LLMProvider` 接口、按顺序响应并冻结输入快照的 `ScriptedMockLLM`、拒绝缺失/多余/错型字段的 `parseAction`，以及名称唯一且每次至多调用一个 handler 的 `Dispatcher`；公共接口统一由 harness `index.ts` 导出。
- Spec 检查：没有实现文件工具、命令执行工具、Policy、Memory、Agent Loop、真实 Provider、重试、网络调用或 T07 以后能力，未增加依赖。结论为无 Critical。
- 质量检查：确认调用输入和内部数组使用不可变快照，解析错误码固定为 `ACTION_PARSE_FAILED`，分发错误码仅为 `TOOL_UNKNOWN`/`TOOL_EXECUTION_FAILED`，handler 异常不泄漏内部消息，同类型 handler 拒绝重复注册，单次 execute 恰调用一次匹配 handler。结论为无 Critical。
- 评审安排：本任务由用户直接指定当前 Codex 任务负责；当前协作约束不允许再创建未被用户明确要求的子智能体，因此 Spec 与质量检查由当前任务分两轮本地完成，并如实记录该流程差异。人工修改为零。
- 完整门禁：`pnpm test` 为 5/5 文件、17/17 用例通过；`pnpm lint` 退出码 0；`pnpm typecheck` 覆盖 API、Web、Harness 与 tests，退出码 0；`pnpm build` 完成 API TypeScript 构建和 Web Vite `8.1.5` 构建（14 个模块），退出码 0。
- 外部状态：后续 MR !7 已以合并提交 `cdcc01f` 进入 `dev`；Pipeline 状态尚未补录，留待最终审计核对。

### 2026-07-18 · T07 受限工具、治理与最小批准

- 分支与提交：在专用分支 `feat/t07-safe-tools-policy` 执行；规划 `2b7b7f6`，RED 测试 `f05cee2`，受限工具 `b58f477`，治理与批准 `3d580e0`，安全加固 `1524de3`。本记录提交与末尾清空 `guiding.md` 的提交随后补齐；由于安全复审新增一次加固提交，最终总数采用 `guiding.md` 允许的 7 条上限。
- 基线与环境：固定使用 Node `24.14.0`、pnpm `11.14.0`。系统默认 Node `20.19.4` 不满足 pnpm 引擎；受限沙箱内 Vite/Vitest 会触发 `spawn EPERM`，获准在同一工作区沙箱外按原命令复验，未把环境错误计作 RED 或项目失败。
- TDD 证据：先提交 5 个 T07 测试文件，聚焦运行得到 26 个失败、17 个 T06 回归通过；失败均为 `PathGuard`、`FileTools`、`CommandTool`、`PolicyEngine`、`ApprovalGate` 构造器/导出尚不存在。初次 GREEN 后，安全审查分别真实复现命令参数绕过、内部链接泄漏敏感内容、无界超时以及完整白名单误放行删除命令，再补回归并修复；最终测试为 10/10 文件、65/65 用例通过。
- 实现范围：文件读写统一经过 workspace 相对路径、真实路径 containment、敏感文件和符号链接逃逸检查；命令使用 `spawn(executable,args,{ shell:false })`，以可序列化的精确调用规则授权，默认 60 秒超时、stdout/stderr 合计 32 KiB；Shell、删除类和非白名单调用在 spawn 前拒绝。Policy 只返回 `allow | ask | deny`；写入需一次明确批准，拒绝、缺少批准器或批准器异常时 handler 调用为零；Dispatcher 保持 T06 兼容。
- 独立审查：首次 Spec/质量审查判定 3 个 Critical，全部在 `1524de3` 关闭；复审又发现白名单可显式包含删除命令，amend 后以 `rm -rf .`、`git clean -fdx` 的真实 RED/GREEN 关闭。最终复审的 Spec compliance 与 Task quality 均 PASS；最终全范围代码审查结论为无 Critical、Ready to merge。
- 已知非阻断项：realpath 检查与文件打开仍有 TOCTOU 窗口；Policy 对文件路径只作词法判断，真实目标安全依赖标准 `FileTools` handler；Windows `taskkill` 为 best-effort 且未等待确认；filesystem root 作为 workspace 时新文件路径切片有边界错误；另有 POSIX 后代持管道测试和 UTF-8 截断边界缺口。按本项目“只由 Critical 阻断”规则记录，未扩展 T07 范围。
- 最终门禁：主控在 Node `24.14.0`、pnpm `11.14.0` 下重新运行 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`；结果为 65/65 测试通过，ESLint 无错误，API/Web/Harness/tests 类型检查通过，API TypeScript 与 Web Vite `8.1.5`（14 modules）构建通过，整体退出码 0。
- 人工修改：用户仅指定当前任务负责 T07，未直接修改工作区文件；实现由按 PLAN 派出的新鲜 subagent 完成，主控负责全文件阅读、基线、审查、修复闭环和最终验证。
- 外部状态：后续 MR !8 已以合并提交 `4fb39c7` 进入 `dev`；Pipeline 状态尚未补录，留待最终审计核对。

### 2026-07-18 · T08 启动前收尾

- 基线状态：T06、T07 已分别通过 MR !7、MR !8 合入 `dev`，对应合并提交为 `cdcc01f`、`4fb39c7`；同步修正 PLAN 与旧日志中的“待 MR”状态，未猜测 Pipeline 结果。
- 安全复查：确认 Shell 分类使用不完整名称集合，且 Git 删除类判断只覆盖 `clean`，导致精确白名单可能放行 `dash/fish`、`git rm` 与 `git reset --hard`。
- TDD 证据：先扩展 CommandTool/Policy 回归测试，聚焦运行得到 8 个预期失败、28 个既有用例通过；最小修复统一 `.exe` 名称归一化并补齐危险 Git 调用后，同一聚焦命令为 36/36 GREEN。
- 完整门禁：Node `24.14.0`、pnpm `11.14.0` 下 `pnpm test` 为 10/10 文件、73/73 用例通过；lint、typecheck、build 均退出码 0。
- 范围边界：本提交仅收尾 T07 安全分类和过程记录；不实现 T08 的配置、Memory、Trace 或脱敏功能。

### 2026-07-18 · T08 配置、JSON Memory 与脱敏 Trace

- 分支与提交：在专用分支 `feat/t08-config-memory` 执行；规划为 `85bbf15`，RED 测试为 `6b70a29`，核心实现为 `ace9242`。本记录提交与末尾清空 `guiding.md` 的提交随后补齐，保持总计 5 个提交。
- 基线与环境：固定使用 Node `24.14.0`、pnpm `11.14.0`。系统默认 Node `20.19.4` 无法运行 pnpm 11.14；受限沙箱内 Vite/Vitest 触发 `spawn EPERM`，获准在同一工作区沙箱外验证后通过。T08 开始前基线为 10/10 测试文件、73/73 用例通过。
- TDD 证据：先只创建 4 个 T08 测试文件，聚焦运行得到 21/21 失败，原因均为 `parseHarnessConfig`、`Redactor`、`JsonMemory`、`JsonTrace` 导出或构造器不存在。实现后同一命令为 21/21 GREEN；评审新增 6 个边界用例后为 27/27 GREEN。
- 实现范围：配置只接受 workspace、精确命令规则、步数、超时、输出上限和 workspace 相对 Memory 路径，并拒绝未知、越界、逃逸及 Key/secret 字段；Memory 使用版本化 JSON、同目录临时文件加 rename 原子更新，支持缺失空库、按 id upsert、有限相关检索、清空和损坏结构稳定错误；Trace 按 step 保存 Action、Policy、Observation、状态和停机原因；Memory 与 Trace 共用递归 Redactor。
- 脱敏边界：Redactor 遮蔽会话显式敏感值、Bearer、API Key 字段和值以及独立 `sk-…` 形态。测试只使用 fake Key，并直接断言 Memory 拒绝敏感写入、Trace 原始落盘内容、读取结果和错误结构均不含 fake Key 明文。
- 评审结果：按 Spec 与质量两轮本地检查，补齐命令规则嵌套未知字段、空白存储路径、独立 Key 形态、重复 Memory id、重复 Trace step 和 EOF 空白。未发现未关闭 Critical；原子写入失败不覆盖既有损坏文件，检索默认上限 5、硬上限 100。
- 流程差异：用户要求当前任务自动完成，但当前协作约束禁止主动派生子智能体，因此没有调用新鲜 subagent；由当前任务逐条映射 SPEC、复查提交差异并增加对抗性测试，如实保留该差异。
- 最终门禁：Node `24.14.0` 与 pnpm `11.14.0` 下，`pnpm test` 为 14/14 文件、100/100 用例通过；`pnpm lint`、`pnpm typecheck`、`pnpm build` 均退出码 0，Web Vite `8.1.5` 构建 14 个模块成功。
- 范围审计：未新增依赖、schema 库、数据库或日志框架；未实现 T09 反馈/Agent Loop、T10 真实 Provider/凭据/CLI 或 T11 WebUI。Memory、Trace 默认文件和原子写入临时文件已加入 `.gitignore`。

### 2026-07-18 · T09 启动前 T08 收尾

- 合并状态：T08 已通过 MR !9 以 `6de04f9` 合入 `dev`；同步修正 PLAN 顶部状态与任务表，Pipeline 状态仍留待最终审计核对。
- 根因审查：配置只扫描敏感字段名，合法 `args` 中的 `sk-…` 值可通过；Trace 类型遗漏 SPEC 的 `running` 且强制 Action；Memory 查询校验假定 tags/keywords 一定为数组。
- TDD 证据：先新增配置敏感值、无 Action running Trace、非数组 tags 与 null keywords 四个回归用例；聚焦测试得到 4 个预期失败、21 个既有用例通过。最小修复后同一命令为 3/3 文件、25/25 用例通过。
- 修复范围：配置复用统一 Redactor 拒绝凭据值；Trace 恢复 `running` 与可选 Action 契约；Memory 对运行时非数组查询返回 `MEMORY_INVALID_QUERY`。未实现任何 T09 Agent Loop 或反馈功能。
- 完整门禁：Node `24.14.0`、pnpm `11.14.0` 下 14/14 测试文件、104/104 用例通过；lint、typecheck、build 均退出码 0。

### 2026-07-19 · T09 反馈重点维度与自研 Agent Loop

- 分支与提交：在独立 worktree 的 `feat/t09-feedback-loop` 执行；规划为 `8ebcc58`，Feedback RED/GREEN 为 `a839e38`，AgentLoop RED 为 `5933435`，循环实现与评审修复为 `af8d5e5`。本记录提交与末尾清空 `guiding.md` 的提交随后补齐，保持总计 6 个提交。
- 基线与环境：固定使用仓库现有依赖、Node `24.14.0` 与 pnpm `11.14.0`，开始前 14/14 测试文件、104/104 用例通过。独立 worktree 复用与锁文件一致的主仓库依赖；pnpm 运行前依赖校验因 worktree 路径元数据不同会尝试安装，故关闭自动安装检查，并用本地忽略的 wrapper 保证根脚本内嵌 pnpm 仍使用 Node 24。未下载、升级或改写锁文件。
- TDD 证据：Feedback 测试先得到 5/5 失败，原因均为 `classifyFeedback is not a function`，实现后 5/5 GREEN；AgentLoop 集成测试先得到 6/6 失败，原因均为 `AgentLoop is not a constructor`，实现后与 Feedback 初次聚焦测试合计 11/11 GREEN。最终审查针对非命令成功文案新增真实 RED，修复后增强聚焦测试为 18/18 GREEN。
- 实现范围：新增 `pass | fail | timeout | environment_error` 结构化分类和最多 160 字符的脱敏 Observation；AgentLoop 串联 task、JSON Memory、ScriptedMockLLM、严格 Action 解析、共享 Policy/Approval/Dispatcher、单工具执行、Feedback、Trace 与终止状态。默认最多 8 步；首次业务失败回灌，第二次业务失败立即停止；finish、blocked、failed 与 max_steps 都返回稳定 RunResult。
- 安全与错误边界：Policy deny 在 Dispatcher 前停止；ask 仍由真实 ApprovalGate 决定，deny 与缺少批准的 read/write handler 均显式断言零调用。Provider、解析、Memory、Trace、timeout 与执行环境错误均确定性失败，不自动重试副作用。测试只使用 fake Key，Trace 和完成摘要不保留明文。
- 独立评审：新鲜实现 subagent 完成三个实现提交；任务评审首次发现 1 个 Important——deny/未批准测试未显式证明 handler 零调用，补真实 Dispatcher handler 计数后复审通过。全分支审查再发现 3 个 Important 和 1 个 Minor：非命令成功 Observation 文案不准确、脱敏/截断测试未触发真实路径、错误矩阵缺 timeout/终态/无重试断言、默认 8 步未锁定。统一修复后，通用成功文案改为 `pass: tool completed`，结构化错误诊断真实经过 Redactor 与 160 字符截断，并逐项锁定 timeout、错误 Trace、调用上限和默认 8 轮。最终复审结论为 `Ready to merge: Yes`，无 Critical/Important；仅记录 1 个不阻断 Minor：契约外自定义 handler 若返回非字符串 `error.message`，类型守卫可进一步收紧，未为此扩展有效 ToolResult 范围。
- 完整门禁：主控使用项目根脚本重新运行 `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`；评审修复后的结果为 16/16 测试文件、122/122 用例通过，ESLint 无错误，API/Web/Harness/tests 类型检查通过，API TypeScript 与 Web Vite `8.1.5`（14 modules）构建通过，整体退出码均为 0。沙箱内 Vitest/Vite 的 `spawn EPERM` 在同一工作树沙箱外按原命令复验通过。
- 范围审计：未新增依赖，未修改锁文件；未实现真实 Provider、凭据、CLI、网络、机制演示或 WebUI。项目 AI 指令另行补充“优先检查和复用仓库环境”规则；该本地 `.agents/AGENTS.md` 被仓库忽略，不占用 T09 提交。

### 2026-07-19 · T10 启动前 T09 合并后收尾

- 合并状态：T09 已通过 MR !11 以 merge commit `3b0d3fe` 合入 `dev`；本轮直接在 `dev` 收尾，不创建或共用 T10 分支，也未实现 T10 功能。
- 根因：AgentLoop 与 Dispatcher 可分别持有治理对象，裸 Dispatcher 会让 `ask` 动作绕过批准；非零命令反馈只保留退出码，未回灌 stdout/stderr 摘要；每次 `run()` 都从 step 1 开始，导致复用同一 Trace 时重复冲突；PLAN 仍误记为待 MR。
- RED 证据：先改为裸 Dispatcher 并新增批准、反馈摘要、Trace 连续运行回归，聚焦测试得到 6 个预期失败；其中未批准写入实际执行、批准回调 0 次、摘要缺失、损坏 Trace 在 Provider 后才失败、第二次运行写入失败均被真实复现。
- GREEN 修复：AgentLoop 统一执行 Policy/Approval 后再调用 Dispatcher；失败命令优先汇总 stderr、stdout，经 Redactor 脱敏并受 160 字符上限约束；运行前读取 Trace，从最大 step 后追加，RunResult 只返回本次运行条目；损坏 Trace 在 Provider/handler 前停止。
- 验证：聚焦测试 2/2 文件、20/20 用例通过；完整门禁 16/16 文件、124/124 用例通过，`lint`、`typecheck`、`build` 均退出码 0。未新增依赖、数据库、Provider、CLI 或 WebUI。

### 2026-07-20 · T10 安全凭据、兼容 Provider、CLI 与三项离线演示

- 分支与提交：在 `feat/t10-cli-provider-demo` 上完成；规划 `2eedd1b`，凭据实现 `ff73d6b`，凭据安全边界修复 `7d6d181`，Provider/CLI 与最终安全修复 `6842cd2`，三项演示 `ad530ab`。本记录和最后清空 `guiding.md` 的提交随后补齐，最终保持 7 条提交上限；未执行远端推送、MR 或 Pipeline 操作。
- 环境与基线：固定使用 Codex bundled Node `24.14.0` 与仓库 pnpm `11.14.0`。开始前 T09 收尾基线为 16/16 文件、124/124 用例；恢复收尾前基线为 19/19 文件、177/177 用例。受限沙箱内 Vitest/Vite 会触发 `spawn EPERM`，获准在同一工作区沙箱外按原命令运行；没有把环境错误当作 RED。
- 凭据 TDD：初始测试 14/14 因 `CredentialStore` 不存在而 RED；实现 scrypt + AES-256-GCM 后 GREEN。安全审查发现默认 KDF 成本、mutation 竞态和原子失败伪覆盖，随后新增确定性 RED，显式固定 scrypt `N=2^17,r=8,p=1,maxmem=256 MiB`，用拥有者令牌文件锁覆盖跨实例/进程 mutation，并真实验证临时文件创建后 rename 失败的清理。聚焦最终扩展到 19/19；独立复审无 Critical/Important。
- Provider/CLI TDD：三组测试先得到 23 个预期失败，原因是 CLI/Provider 不存在及 config 拒绝 provider 字段。实现单次 Chat Completions、严格配置、隐藏 stdio 边界、凭据 init/status/update/clear、`pnpm agent --task` 与真实 Harness 组装后 GREEN。提交前审查用真实 307 重定向复现额外请求，补 `redirect: manual` 后复审 PASS。
- 最终安全修复：全分支审查发现 `/v1` 重复拼接、空/弱秘密可保存、非回环 HTTP 会明文携带 Authorization 三项 Important。逐项先 RED：endpoint 4 个路径断言失败；凭据/CLI 14 个弱输入断言失败；config/Provider 4 个远端 HTTP 断言失败。修复后 endpoint 支持根路径、普通前缀、已有 `/v1` 和完整 endpoint；主密码 trim 后至少 12 字符、Key 非空；任意远端只允许 HTTPS，本机 `localhost`/`127.0.0.1`/`::1` 可用 HTTP。聚焦 96/96、全量 214/214，复审 PASS；临时 fixup 已 autosquash 到 Provider/CLI 提交。
- 三项演示：`pnpm demo` 缺少脚本时先退出 1；新增 `tests/integration/demos/mechanisms.test.ts` 后 4/4 GREEN。真实 AgentLoop/Policy/Approval/Dispatcher 装配自动证明危险删除和敏感文件访问在治理层阻断且 handler 零调用；首次业务失败的脱敏摘要进入下一轮并驱动不同 Action 成功；第二次连续业务失败后 Provider 与 handler 均恰为 2 次，不发生第三次调用。独立任务审查 Spec/质量均 PASS，零 finding。
- 最终门禁：autosquash 后主控重新运行 `pnpm test`（20/20 文件、214/214 用例）、`pnpm demo`（1/1 文件、4/4 演示）、`pnpm lint`、`pnpm typecheck`、`pnpm build` 和 `git diff --check`，全部退出码 0；Web Vite `8.1.5` 构建 14 个模块成功。测试仅使用本地回环 stub、`ScriptedMockLLM` 和 fake Key。

- 安全与范围：凭据文件只落盘版本、salt、12-byte nonce、tag、ciphertext；主密码/API Key 不进入参数、普通配置、错误、Trace、Memory 或测试快照。未新增外部依赖、数据库、多 Provider、线上服务、T11 WebUI 或 T12 分发行为。公开导出的 CredentialStore 文件系统测试接缝仍记录为非阻断 Minor，留待后续 API 收敛。
- 未执行项：真实学校 API smoke 只能由项目负责人在本地使用真实凭据受控执行，本任务未执行，也未伪造结果。MR、Pipeline 和合并状态留待用户后续远端流程补录。

### 2026-07-20 · T11 启动前 T10 合并后安全收尾

- 合并状态：T10 已通过 MR !12 以 merge commit `64458b8` 合入 `dev`；本轮直接在 `dev` 修复审查问题，不占用 T10 功能分支的 7 条提交，也未开始 T11。
- 根因与 RED：CLI 只把当前凭据交给 Memory/Trace 的 Redactor，Provider 返回的敏感工具 Action 仍能进入批准和 handler；CommandTool 没有 cwd，导致真实命令留在 CLI 启动目录；审批入口忽略 ApprovalRequest。新增真实 CLI/CommandTool 回归后得到 4 个预期失败，并用既有 AgentLoop 用例确认敏感 finish 摘要应脱敏完成而不是误阻断。
- 修复：AgentLoop 接受调用方 Redactor，在 Policy、批准和工具前阻断含敏感信息的非 finish Action；CommandTool 支持 cwd，CLI 显式传入配置 workspace；审批提示只显示动作类型和目标，不显示写入正文或命令参数。
- 验证：T10/T09 联合聚焦测试 3/3 文件、56/56 用例通过；完整测试 20/20 文件、218/218 用例，`pnpm demo` 4/4，lint、typecheck、build 和 diff check 均通过。未访问公网或使用真实 Key。

### 2026-07-20 · T11 Task 1 共享 runner 与回环 API

- RED/GREEN：锁定 Node 在获准的非沙箱环境运行 Harness/API/CLI 聚焦测试；初始因本地服务模块缺失及 Provider 限流停机分类不正确而 RED。实现共享 `runHarnessTask`、Fastify 工厂/进程入口、CLI 复用及闭合 Provider stopReason 后，3/3 文件、45/45 用例 GREEN，API typecheck/build 与 lint 退出 0。
- 审查修复：配置缺失/无效仍读取主密码、畸形 JSON 与超限 body 均误报 500，共产生 4 项预期 RED；增加共享配置预检及 Fastify 客户端错误白名单后，2/2 文件、34/34 用例 GREEN。配置执行时仍会重验，未知异常仍固定映射 500，错误体不含正文、Key 或异常原因。
- 评审与边界：Task 1 在 CLI 顺序和 Fastify 客户端错误修复后复审无遗留 finding；未使用真实 Key，未访问学校 API。

### 2026-07-20 · T11 Task 2 静态/本地双入口 WebUI

- RED/GREEN：`App`、`LocalApp` 和客户端尚不存在时两个测试套件按预期导入失败；实现静态页面、本地受控表单、单次 JSON POST 和 `local-run` 入口后 GREEN。local 构建曾错误采用静态入口，入口顺序测试先因缺 `order: "pre"` 失败，修复后静态 build 为 17 modules、本地 build 为 19 modules。
- 安全审查：以 8 项 RED 复现结果回显当前 Key 与无效 Trace 被接受，随后递归拒绝含 Key 的结果，并精确验证 step、闭合枚举、可选字符串和四类 Action；对象化枚举再以 RED 复现原生转换异常，改为仅接受字符串后固定映射格式错误。两个 Web 测试最终 21/21 用例 GREEN。
- 完整证据：SSR 类型门禁先暴露 NodeNext 扩展名和 JSX 配置错误；未放宽 strict 或排除测试，仅修正测试类型入口后完整 typecheck 通过。静态 artifact 扫描 `/api/runs|127\\.0\\.0\\.1|localhost|type="password"|sk-` 无匹配，lint、两种 build 与 diff check 通过；Task 2 经响应防泄漏、schema 和枚举复审后无遗留 finding。

### 2026-07-20 · T11 Task 3 本地启动、Pages 与交付记录

- TDD：先扩展 CI/launcher 契约；RED 为 `pages` job 和 `scripts/local-web.mjs` 缺失导致 3 项中 2 项失败。新增 launcher、根 `web:local` 和 Pages job 后，聚焦契约 3/3 GREEN；随后 lint 发现 `.mjs` 缺失 Node 全局声明，显式导入 `node:process`/`node:console` 后复跑通过。
- 本地 smoke：锁定 Node 24.14.0 与 pnpm 11.14.0 下启动 `pnpm web:local`，确认 API 回环 `127.0.0.1:4174` 与 Vite `127.0.0.1:5173`；Ctrl+C 后端口无监听残留。未填写真实 Key，未调用学校 API。
- Pages 边界：保留精确 `unit-test`，`pages` 仅依赖它并限默认分支；构建默认静态 Web，仅复制 `apps/web/dist/.` 至 `public` artifact。合约扫描确认不含 API Key、凭据文件或 `.ai4se` artifact。
- 信号审查 Important：审查指出已注册的 SIGINT/SIGTERM handler 可能让父进程以 0 退出。先新增两个 launcher 行为测试，因可注入 runner 缺失而 RED；实现后直接断言 SIGINT→130、SIGTERM→143、两个仍运行子进程均收到清理信号，且其后续 `exit`/`error` 不能覆盖父进程状态。聚焦 CI/launcher 为 2/2 文件、5/5 用例 GREEN。
- 新鲜完整门禁：修复后的 `pnpm test` 24/24 文件、258/258 用例；`pnpm demo` 4/4；`pnpm lint`、`pnpm typecheck`、`pnpm build` 和 `git diff --check` 均退出 0。此前 Task 2 测试配置阻断的 typecheck 已由上游提交 `a943446` 修复并复审，本任务未改其源码。
- 交付边界：未执行 push/MR/Pipeline/Pages URL 或真实学校 API smoke；上述外部证据留待项目负责人补录。

### 2026-07-20 · T11 全分支最终审查修复

- RED/GREEN：端口、Web 安全呈现、launcher child error/exit 与静态安装命令测试先在 4 个文件中产生 23 项预期失败；最小实现后同组 47/47 GREEN。加上本地 API 与 CI 合约的聚焦复跑为 6/6 文件、62/62 用例通过。
- 端口与启动器：API、Vite proxy 和 launcher 使用相同严格规则，只接受十进制 1..65535；launcher 把规范化端口环境传给两个子进程，且只输出“正在启动本地 API”，ready 由 API/Vite 自身监听日志证明。child `error`、正常零退出和非零退出都会置父进程为失败并只终止仍运行的同伴；stopping 后事件不覆盖状态或重复清理。
- Web 与静态页：fetch 连接失败固定映射“本地服务未启动”，收到非 2xx 仍不解析远端正文并返回通用固定错误；SSR 结果视图显示已通过 schema 与递归 Key 检查的 summary 和各条 stopReason。静态命令区增加当前仓库可执行的 `pnpm install --frozen-lockfile`，未伪造 T12 tarball 命令。
- 第一次新鲜完整门禁：`pnpm test` 为 25/25 文件、282/282 用例，`pnpm demo` 为 4/4，lint 与 typecheck 退出 0；静态 build 为 17 modules，默认 artifact 扫描无 `/api/runs`、回环地址、password input 或测试 Key，`local-run` build 为 19 modules。未使用真实 Key、未访问学校 API，也未执行 push/MR/Pipeline/Pages URL 验证。

### 2026-07-21 · T11 真实 Provider smoke 与 Action 提示修复

- 真实诊断：负责人创建限额临时 Key 并仅保存至 Git 忽略的 `.ai4se/temp-api-key.txt`；模型列表请求确认 `qwen-turbo` 与 `DeepSeek-R1` 等模型可用。诊断脚本从该文件读取 Key，只输出用当前 Key 精确替换后的响应；测试结束后逐个删除 Key 文件与诊断脚本，并要求负责人在平台撤销临时 Key。
- 根因证据：旧 system message 未声明 Action schema，`qwen-turbo` 返回 HTTP 200 与 `{"action":"respond","content":"..."}`，Provider 能解析 JSON，但 Harness 以 `parse_error` 拒绝未知 Action。仅将 system message 改为四种精确 Action schema 并要求普通问答使用 `finish` 后，同一真实 API 返回 `{"type":"finish","summary":"..."}`。
- TDD：Provider 请求契约在旧实现上为 27 项中 1 项预期 RED；最小提示修复后，Provider/AgentLoop/API 聚焦 3/3 文件、54/54 用例 GREEN。完整 `pnpm test` 为 25/25 文件、282/282 用例，lint、typecheck 与 build 均通过，默认静态构建 17 modules。
- WebUI smoke：负责人使用 `https://njusehub.info/v1/chat/completions`、`qwen-turbo` 与简单问答观察到 `completed`，安全摘要正常，Trace 为 `finish · allow · completed · pass: finish`，停止原因为 `finish`；页面在结果后自动清空 API Key。`DeepSeek-R1` 仍可能因输出非纯 JSON 而得到 `provider_action_invalid`，不作为本次已验证兼容模型。
- 外部边界：真实学校 API smoke 已完成；push、非 squash MR、Pipeline passed 与公开 Pages URL 仍由负责人执行和记录。

### 2026-07-21 · T12 启动前 T11 合并与 Windows 基线修复

- 合并状态：T11 已通过 MR !13 以 merge commit `7c68221` 合入 `dev`；公开 Pages URL 与远端 Pipeline 状态仍留给 T12 使用真实结果核验，不以本地合并记录代替。
- 基线问题：pull 后 Windows 工作区将 `.gitlab-ci.yml` 检出为 CRLF，CI 契约测试把 YAML 片段换行写死为 LF，导致完整测试 25 个文件中 1 个失败、281/282 用例通过；YAML 内容本身未改变。
- 修复与验证：将该断言收窄为兼容 LF/CRLF 的精确结构匹配，聚焦 CI 契约测试恢复为 1/1 文件、3/3 用例通过；修复不改变 Pages job 或产品行为。

### 2026-07-21 · T12 最终自动化审计与交付证据

- 环境：固定使用 Codex bundled Node `24.14.0` 启动 pnpm `11.14.0`；受限沙箱中的 Vitest/Vite 或 Git 子进程 `spawn EPERM` 均按 brief 在非沙箱环境原命令复跑，没有充当 RED 或产品失败证据。
- RED：先新增 CI 契约和最终审计测试；有效聚焦运行共 27 个文件、293 项，新增 10 项失败、既有 283 项通过。审计 9 项因 `scripts/final-audit.mjs` 不存在而失败，CI 1 项因 `unit-test` 缺少 `pnpm demo` 及后续命令而失败。
- GREEN：实现无依赖 Node 审计、根 `final:audit` 与 CI 顺序后，CI/审计聚焦为 2/2 文件、13/13 用例通过。真实仓库预跑暴露低置信度测试占位符误报，先以新增用例得到 11 项中 1 项 RED，再收窄高置信度 OpenAI 规则，审计测试 11/11 GREEN。
- 审查 RED/GREEN：`GIT_DEPTH` 先 1/3 RED 后 CI 3/3 GREEN；OpenAI/GitLab/AWS/PEM 四类含 NUL 历史 blob 先 4/14 RED，替换 `git grep -I` 为 `ls-tree -z` + `cat-file` 后 14/14 GREEN；stage 后工作树安全覆盖先 1/15 RED，index blob 扫描后 15/15 GREEN；raw tree 恶意路径真实回显 token、换行与 ANSI，位置脱敏/转义后 16/16 GREEN；Pages 新增危险文件 6 项 RED，最小 allowlist 后子集 14/14 GREEN；8 MiB+1 对象先被静默接受，明确上限后 1/1 GREEN。
- 有界内存与 gitlink RED/GREEN：用 `git fast-import` 创建 48 个唯一 1 MiB 历史 blob，并在 16 MiB V8 heap 下用 preload 守卫限制单个 Map 累计 Buffer 不超过 20 MiB；旧实现确定性触发 `AUDIT_TEST_BUFFER_BUDGET` 并退出 2，重构后同一用例 1/1 GREEN（约 3.2 秒）。真实 index 写入 mode `160000` gitlink 与 mode `120000` symlink canary 后，旧实现把 commit OID 当 blob 而退出 2；过滤 gitlink、保留 symlink 正文扫描后 1/1 GREEN，canary 仍以状态 1 和脱敏诊断检出。
- 审计行为：扫描 `git ls-files` 工作树、index blob 和 `git rev-list --all` 全部可达树/blob；四类规则共用同一来源，含 NUL 内容不跳过。历史按 commit 与最多 64 个 OID 的逻辑批次处理，正文批次以 16 MiB 为预算并在读取后立即分类，只长期保留 `oid -> category[]`；index 同样跳过 mode `160000` gitlink 并按有界批次扫描其他 blob。输出仅含稳定类别、经全规则脱敏并控制字符单行转义的相对路径/提交标识及处置提示。单对象超过 8 MiB 在读取正文前以稳定 `AUDIT_ERROR/BLOB_SIZE_LIMIT/位置` 失败。
- CI/Pages：精确 job 名保持 `unit-test`，镜像 Node `24.14.0`、pnpm `11.14.0`，设置 `GIT_DEPTH: "0"`；install/test/lint/typecheck/build 后运行 demo、Harness build/pack 与 final audit，tarball 输出到已忽略的 `.ai4se/harness-pack`。`pages` 仍 `needs: ["unit-test"]`、仅默认分支运行且只复制 `apps/web/dist/.` 到 `public/`；artifact 只允许实际 Vite 的 `index.html` 与扁平 `assets`，拒绝 `.env*`、credentials 扩展、backend/functions/server/API 入口及其他文件。
- 本地门禁：`pnpm install --frozen-lockfile` 显示 4 个 workspace 已是最新；最终聚焦为 2/2 文件、28/28 用例，`pnpm test` 为 27/27 文件、309/309 用例（31.57 秒）；`pnpm lint`、`pnpm typecheck`、`pnpm build` 均退出 0，Vite 构建 17 modules；`pnpm demo` 为 1/1 文件、4/4 用例。CI 等价 pack 生成唯一 `ai4se-harness-0.1.0.tgz`（20,504 bytes），随后按明确单文件删除并非递归删除空 `harness-pack` 子目录，保留 `.ai4se`；真实 `pnpm final:audit` 已扫描工作树、index、完整历史对象和现有 Pages artifact 并退出 0。
- 分发与文档：完整测试包含从 tarball 离线安装、ESM 导入及 CLI smoke；README、LICENSES 和负责人本人 REFLECTION 已在此前 T12 提交交付，本提交保持 README/REFLECTION 不变。
- Provider 证据：仅记录此前负责人本地实测的非敏感摘要——endpoint `https://njusehub.info/v1/chat/completions`、model `qwen-turbo`、HTTP 200、`completed`、1 step、`finish`、无 Key 回显；本任务没有联网或接触真实 Key。
- 自审：测试 canary 只在运行时由片段拼接；脚本不把秘密放入参数、错误输出或快照；未新增依赖或修改锁文件；未修改产品功能、README、REFLECTION 或 guiding。
- 远端缺口：未执行 push、MR、merge 或任何远端写操作。GitLab MR、最新 Pipeline passed 和公开 Pages URL 均待负责人远端操作/核验，本地契约与旧记录不替代实时状态。

### 2026-07-21 · T12 最终整分支审查修复

- Important 1（CI Git）：`node:24.14.0-bookworm-slim` 未声明 Git 安装。先让 pipeline contract 因四条命令缺失 RED；再仅在 `unit-test.before_script` 依次加入 `apt-get update`、`apt-get install -y --no-install-recommends git`、`rm -rf /var/lib/apt/lists/*`、`git --version`，Pages job 保持不安装 Git。
- Important 2（工作树覆盖）：动态 untracked canary 在旧实现下状态 0。当前文件枚举改为 `git ls-files --cached --others --exclude-standard -z`；普通文件使用 `lstat` 后读取，symlink/reparse link 只用 `readlinkSync` 扫描 link text，绝不跟随目标。物理 symlink 用例在当前 Windows 因 `symlinkSync` EPERM 条件跳过，未以读取 target 冒充。
- Important 3（真正内存上界）：192 个小型唯一历史 blob 使旧 `oid -> category[]` Map 触发 `AUDIT_TEST_MAP_ENTRY_BUDGET`；改为固定容量 64 的 LRU 后 GREEN。删除无界 `reportedPaths`，让 findings 以类别/路径键直接去重并固定为 256 条；257 个 untracked canary 从旧实现漏扫状态 0，修复后稳定状态 2、`AUDIT_ERROR | FINDING_LIMIT`，不回显秘密。另以 RED→GREEN 保证同类别/路径只保留 `rev-list` 首次扫描到的提交诊断。
- 门禁：聚焦 audit+pipeline 为 2/2 文件、32 passed/1 skipped（33 total）；完整 `pnpm test` 为 27/27 文件、313 passed/1 skipped（314 total，37.83 秒）；`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm demo`、`pnpm final:audit` 均退出 0，Vite 构建 17 modules。未修改 README、REFLECTION、guiding 或锁文件，未新增依赖，未读取真实 Key，未执行远端操作。

### 2026-07-21 · dev 统一项目环境入口

- 根因：系统默认 `D:\nodejs\pnpm.ps1` 固定调用 Node 20，与项目要求的 Node 24/pnpm 11 不兼容；直接启动 Vitest 虽可使用 Node 24，却绕过 pnpm 注入的 `npm_execpath`，使 tarball smoke 误报“未提供 pnpm 启动路径”。此前反复调整命令属于执行环境不一致，不是产品代码反复失效。
- 决策：所有 Txx 已结束，后续收尾直接在 `dev` 提交。新增单一 PowerShell 入口，固定验证 Node 24.14.0/pnpm 11.14.0、设置 PATH 与 npm 启动元数据，并统一承载 install/test/lint/typecheck/build/demo/audit/all；未来智能体不得再手工拼接环境命令。
- RED/GREEN 与门禁：环境契约先因统一脚本缺失得到 1/1 预期失败；初版脚本又暴露 Windows PowerShell 5.1 对无 BOM 中文源码的解析问题，改为纯 ASCII 脚本后 `versions` 精确输出 Node 24.14.0 与 pnpm 11.14.0。统一 `test` 最终为 28/28 文件、315/315 用例；统一 `all` 下同一完整测试、lint、typecheck、Harness/API/Web build（Vite 17 modules）、demo 4/4 和 final audit 全部退出 0。仓库根 `AGENTS.md` 固化此入口及后续直接在 `dev` 收尾的规则，最后复跑完整测试仍为 315/315。

### 2026-07-21 · dev 最终交付状态与 Release 产物收尾

- 状态核对：T12 已通过 MR !14 以 merge commit `6f8b5d6` 合入 `dev`，功能分支实际为 7 个提交；SPEC/PLAN 中“T12 待执行、上限 6”的旧状态改为真实合并结果。当前仍只把 Pipeline、公开 Pages/Release URL 与最终 `dev → main` 记为外部待办。
- CI RED：先要求 `unit-test` 不含递归批量删除，并保存 `.ai4se/harness-pack/*.tgz`；旧流水线在完整 315 项测试中仅该契约失败，准确命中 `rm -rf /var/lib/apt/lists/*`。
- 最小修复：移除禁用删除命令；保留 Git 安装与版本检查；为 Harness tarball 增加按 ref 命名、保存一年的 job artifact，供后续 GitLab Release 链接使用。Pages job 不接触 tarball，仍只发布静态 Web。
- GREEN 与门禁：统一 `test` 为 28/28 文件、315/315 用例；随后统一 `all` 下相同完整测试、lint、typecheck、Harness/API/Web build（Vite 17 modules）、demo 4/4 和 final audit 全部退出 0。工作树、Git 历史与现有 Pages artifact 扫描未发现凭据命中。
