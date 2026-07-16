# T01 建立过程证据并启动 Brainstorming：提交级执行计划

> 当前分支：`docs/t01-spec-design`
>
> 执行规则：下面每个一级步骤对应且仅对应一个 Git 提交，必须按顺序执行。完成一个步骤时，在同一提交中勾选该步骤及其验收项。
>
> 分支说明：本分支只承载 T01。T01 审计完成后，以独立提交清空本文件，再将本分支合并到 `dev`。T02 必须从最新 `dev` 创建新的独立分支，并在该分支的第一个提交中重新填写本文件。

## 目标

建立真实、连续、可追溯的项目过程证据，通过结构化 brainstorming 明确项目价值、边界、Harness 六个维度和主要贡献方向，为 T02 编写 `SPEC.md` 提供已经由本人确认的设计输入。

## 本任务允许与禁止的内容

- 只允许修改文档和决策记录，不得创建工程骨架、依赖配置、测试代码或业务实现。
- 所有提交信息使用 `类型: 中文解释` 格式。
- `AGENT_LOG.md` 按时间顺序记录事实；`SPEC_PROCESS.md` 记录问题、候选方案、本人判断和设计演化，二者不得互相替代。
- brainstorming 必须逐问逐答，不得一次替用户决定全部需求。
- 至少比较三个可行方案，并记录采纳、拒绝或修改的理由。
- 不得把 prompt、Skill、配置文件或现成 Agent 框架能力当作自研 Harness 内核。

## 文件职责

- `guiding.md`：当前 Txx 任务的提交级执行计划和进度标记。
- `AGENT_LOG.md`：记录时间戳、任务、Skill、关键 prompt/context、人工干预、提交证据和经验。
- `SPEC_PROCESS.md`：记录 brainstorming 的问题、回答、至少三轮关键迭代、候选方案比较及本人决策。
- `SPEC.md`：本次 T01 不创建；由后续 T02 根据已确认的设计记录编写。

---

## 提交 1：建立 T01 提交级规划

**提交信息：** `docs: 规划T01需求探索步骤`

**修改文件：**

- 修改：`guiding.md`

**内容：**

- [ ] 写明 T01 的目标、范围、文件职责和禁止事项。
- [ ] 将 T01 拆成顺序明确、一次提交一个成果的执行步骤。
- [ ] 为每个提交写明文件范围、内容要求和验证命令。
- [ ] 明确 T01 独立分支、合并前清空 `guiding.md`、T02 另建分支的过渡方式。

**提交前验证：**

```powershell
git diff --check
git diff -- guiding.md
git status --short
```

预期：`git diff --check` 无输出；只有 `guiding.md` 被修改；计划中不存在实现代码任务。

**提交命令：**

```powershell
git add guiding.md
git commit -m "docs: 规划T01需求探索步骤"
```

---

## 提交 2：建立过程记录骨架并登记启动证据

**提交信息：** `docs: 建立项目过程记录`

**修改文件：**

- 创建：`AGENT_LOG.md`
- 创建：`SPEC_PROCESS.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**`AGENT_LOG.md` 必须包含：**

- [x] 文档用途、记录格式和不得补写虚假过程的原则。
- [x] T01 启动时间、当前分支 `docs/t01-spec-design` 和基线 commit。
- [x] 主开发环境为 OpenAI Codex App。
- [x] Superpowers 已启用，并记录可核验的版本或插件路径证据。
- [x] 本轮使用的 Skill：`using-superpowers`、`brainstorming`；若尚未触发 brainstorming，明确标记为“准备触发”，不得写成已经完成。
- [x] brainstorming 初始 prompt 原文，以及本次仅做需求探索、禁止实现代码的 context 边界。
- [x] 当前人工决策：选择 A 方向 Coding Agent Harness；尚未确认具体产品边界和主要贡献维度。

**`SPEC_PROCESS.md` 必须包含：**

- [x] 文档用途和记录模板：问题、用户回答、AI 建议、本人判断、设计变化。
- [x] 初始设想与已知硬约束。
- [x] 待回答问题清单，但不得预填未经讨论的结论。
- [x] 关键迭代编号规则，后续至少形成三轮连续记录。

**提交前验证：**

```powershell
git diff --check
Select-String -Path AGENT_LOG.md -Pattern "T01","docs/t01-spec-design","Superpowers","brainstorming"
Select-String -Path SPEC_PROCESS.md -Pattern "问题","用户回答","本人判断","设计变化"
git status --short
```

预期：关键词均能检出；改动仅包含 `AGENT_LOG.md`、`SPEC_PROCESS.md`、`guiding.md`。

**提交命令：**

```powershell
git add AGENT_LOG.md SPEC_PROCESS.md guiding.md
git commit -m "docs: 建立项目过程记录"
```

---

## 提交 3：确认用户价值、使用场景和产品边界

**提交信息：** `docs: 明确项目价值与使用边界`

**修改文件：**

- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**brainstorming 必须逐项确认：**

- [x] 目标用户是谁，以及其当前工作方式。
- [x] 用户面对的真实问题、发生频率和现有代价。
- [x] 至少三个具体使用场景，每个场景写明触发、输入、期望结果和失败影响。
- [x] 一段陌生人能在 30 秒内理解的价值陈述。
- [x] 为什么用户不直接使用现成 Coding Agent；自研 Harness 必须解决哪一个结构性缺口。
- [x] 明确非目标，排除“万能 Coding Agent”、无边界自主执行和与主要问题无关的功能。
- [x] 记录至少一轮因用户质询而发生的设计修改，保留修改前后差异。

**过程证据要求：**

- `SPEC_PROCESS.md` 写入完整的问题、回答、候选解释和本人确认结论。
- `AGENT_LOG.md` 写入本轮使用的 Skill、关键 prompt/context、人工否决或修改内容以及对应 commit 计划。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC_PROCESS.md -Pattern "目标用户","真实问题","使用场景","非目标","30 秒","现成"
Select-String -Path AGENT_LOG.md -Pattern "T01","brainstorming","人工"
git diff --stat
```

预期：所有主题均有本人确认的具体内容，不是只有标题或问题清单；没有新增源码或配置文件。

**提交命令：**

```powershell
git add SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 明确项目价值与使用边界"
```

---

## 提交 4：确认 Agent 能力边界与 Harness 六维机制

**提交信息：** `docs: 明确Agent能力与机制边界`

**修改文件：**

- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**必须形成的设计输入：**

- [x] Agent 可以执行的任务和明确禁止执行的任务。
- [x] 动作与工具：最小工具集合、输入输出、工作目录边界和失败返回原则。
- [x] 客观反馈：测试、lint、类型检查或构建等信号如何判定成功、失败与环境错误。
- [x] 危险动作：哪些动作 `allow`、`ask`、`deny`，审批前后必须保持什么不变量。
- [x] 记忆与上下文：跨会话保存什么、何时检索、何时清除、哪些敏感信息永不保存。
- [x] 决策主循环：上下文组织、单次 LLM 调用、动作解析、执行、观察回灌和停机的最低闭环。
- [x] 配置与可观测性：安全默认值、配置校验、日志脱敏和 Trace 最低要求。
- [x] 明确六个维度都必须由可运行代码提供最低实现，并说明如何用 mock LLM 做确定性验证。
- [x] 记录至少一轮因机制边界不清而发生的设计修订。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC_PROCESS.md -Pattern "工具","反馈","危险动作","记忆","主循环","配置","mock"
Select-String -Path SPEC_PROCESS.md -Pattern "允许","禁止","停机","脱敏"
git diff --stat
```

预期：六个 Harness 维度均有最低实现边界和确定性验证思路；未用提示词替代代码机制。

**提交命令：**

```powershell
git add SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 明确Agent能力与机制边界"
```

---

## 提交 5：比较候选方案并选定主要贡献维度

**提交信息：** `docs: 记录主要贡献方案决策`

**修改文件：**

- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选本步骤已完成的项目

**方案比较要求：**

- [ ] 至少比较三个候选方向，优先从治理、反馈闭环、工具分发/运行控制、记忆与上下文中选择。
- [ ] 每个方案都从用户价值、机制深度、确定性可测性、实现风险、演示效果和项目周期六方面评估。
- [ ] 为每个方案列出至少三个可由代码实现的深度特性，不能只列 prompt、Skill 或配置内容。
- [ ] 写明最终选择、未选方案的拒绝理由及可能保留为基础实现的部分。
- [ ] 定义主要贡献的成功判据，以及无需真实 LLM、网络和真实 key 的验证方式。
- [ ] 记录至少一轮方案比较引发的设计变化，使 `SPEC_PROCESS.md` 累计达到至少三轮关键迭代。

**提交前验证：**

```powershell
git diff --check
Select-String -Path SPEC_PROCESS.md -Pattern "方案一","方案二","方案三","最终选择","拒绝理由","确定性"
Select-String -Path SPEC_PROCESS.md -Pattern "用户价值","机制深度","实现风险","项目周期"
git diff --stat
```

预期：存在三个真实可选方案和明确选择，不是先定结论后补形式化比较；主要贡献具有可编码、可测试的深度。

**提交命令：**

```powershell
git add SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 记录主要贡献方案决策"
```

---

## 提交 6：完成 T01 证据审计并准备合并

**提交信息：** `docs: 完成T01需求探索审计`

**修改文件：**

- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选全部 T01 项并记录审计结果

**审计清单：**

- [ ] `AGENT_LOG.md` 的时间线连续，记录 Skill、prompt/context、人工干预和前五个提交 hash。
- [ ] `SPEC_PROCESS.md` 至少包含三轮真实关键迭代，每轮都有问题、回答、AI 建议、本人判断和设计变化。
- [ ] 目标用户、真实问题、使用场景、价值陈述和非目标已经由本人确认。
- [ ] 已明确为何不用现成 Coding Agent，以及自研 Harness 的结构性价值。
- [ ] Agent 能力边界、六维最低实现、主要贡献维度和确定性测试思路完整。
- [ ] 至少三个候选方案已比较，采纳、拒绝和修改理由可追溯。
- [ ] 仓库中尚无实现代码、工程骨架、依赖配置或测试代码。
- [ ] 写入 T01 结论摘要和移交给 T02 的已确认设计输入；不得提前创建 `SPEC.md`。
- [ ] 明确下一提交只清空 `guiding.md`，随后创建目标为 `dev` 的 T01 MR。
- [ ] 明确 T02 必须在 T01 合入 `dev` 后，从最新 `dev` 创建独立分支，不能继续使用当前分支。

**提交前验证：**

```powershell
git diff --check
git log --oneline dev..HEAD
git diff --name-only dev...HEAD
Select-String -Path SPEC_PROCESS.md -Pattern "关键迭代","最终选择","T02"
Select-String -Path AGENT_LOG.md -Pattern "commit","人工干预","经验"
git status --short
```

预期：分支提交顺序与本计划一致；相对 `dev` 仅包含 `guiding.md`、`AGENT_LOG.md`、`SPEC_PROCESS.md` 等 T01 文档；T01 完成标准全部有证据支持。

**提交命令：**

```powershell
git add SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 完成T01需求探索审计"
```

---

## 提交 7：清空 T01 任务规划

**提交信息：** `docs: 清空T01任务规划`

**修改文件：**

- 修改：`guiding.md`，删除全部内容并保持空文件继续受 Git 跟踪

**执行要求：**

- [ ] 确认提交 1–6 已按顺序存在，T01 审计结论无未完成项。
- [ ] 清空 `guiding.md`，不得删除该文件。
- [ ] 本提交不得夹带 `AGENT_LOG.md`、`SPEC_PROCESS.md` 或其他文件改动。

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
git commit -m "docs: 清空T01任务规划"
```

**提交后分支动作：**

```powershell
git log --oneline dev..HEAD
git diff --check dev...HEAD
git status --short
```

预期：T01 的规划与清空提交均保留，工作区干净，可以推送并创建 `docs/t01-spec-design -> dev` 的 MR；禁止 squash。

---

## T01 完成判定

只有同时满足以下条件，才可合并 T01；T01 合入 `dev` 后才能从最新 `dev` 创建 T02 独立分支：

- [ ] 本人能在 30 秒内向陌生人说明项目价值。
- [ ] 项目边界清楚，不是“万能 Coding Agent”。
- [ ] 至少三个方案经过真实比较。
- [ ] 过程记录真实、连续、可追溯，至少包含三轮关键迭代。
- [ ] Harness 六个维度均有最低代码机制设想，主要贡献方向明确。
- [ ] 全程未编写任何实现代码。
- [ ] `guiding.md` 已通过独立末尾提交清空，MR 禁止 squash。
