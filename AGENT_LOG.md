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
