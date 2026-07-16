# T04 陌生智能体冷启动与规约修订：提交级执行计划

> 当前分支：`docs/t04-cold-start-validation`
>
> 执行规则：下面每个一级步骤对应且仅对应一个 Git 提交，必须按顺序执行。完成一个步骤时，在同一提交中勾选该步骤及其验收项。
>
> 分支说明：本分支只承载 T04。T04 审计完成后，以独立提交清空本文件，再将本分支合并到 `dev`。T05 必须在 G3 通过并合入最新 `dev` 后创建独立分支。

## 目标

先修复当前 `PLAN.md` 已确认的执行歧义，再让一个与主开发智能体类型不同的陌生智能体在全新会话中只凭 `SPEC.md` 和 `PLAN.md` 选择 1–2 个任务试做。完整记录其疑问、暂停点、错误理解和试做差距，区分规约缺陷、计划缺陷与智能体误读；根据证据修订文档并复验，最终以客观记录决定 G3 是否通过。

## 全局约束

- 本任务只允许修改文档和冷启动验证记录；G3 通过前不得创建正式源码、测试、依赖、Dockerfile 或 CI 文件。
- 冷启动智能体必须与主开发智能体类型不同，使用全新会话，不导入聊天历史、memory、隐藏上下文或口头补充。
- 冷启动智能体只获得提交时的 `SPEC.md` 和 `PLAN.md`，不得获得 `AGENT_LOG.md`、`SPEC_PROCESS.md`、`guiding.md` 或课程 TODO。
- 冷启动提示必须要求智能体选择 1–2 个 PLAN Task 试做，遇到不确定立即暂停提问，不得猜测。
- 试做用于暴露规约质量，不构成正式实现；不得把试做源码合入当前分支，也不得据此宣称 T05 已开始。
- 所有问题必须保留原始提问、触发位置和上下文；不得只写整理后的结论。
- 每个发现必须分类为 SPEC 缺陷、PLAN 缺陷、两者不一致、环境缺口或智能体误读，并给出证据。
- 修订前后必须在 `SPEC_PROCESS.md` 记录关键 diff、采纳/拒绝理由和负责人确认。
- 已知的 T03 问题在冷启动前公开修复，但必须记录为“主控预审发现”，不得冒充陌生智能体发现。
- 所有提交信息使用 `类型: 中文解释` 格式；本分支 MR 禁止 squash。

## 文件职责

- `guiding.md`：T04 的提交级计划和进度；合并前通过独立末尾提交清空。
- `COLD_START_VALIDATION.md`：冷启动协议、冻结输入 hash、原始 prompt、智能体类型、环境、逐条问题、试做结果、分类、修订和复验结论。
- `SPEC.md`：发现真实需求或架构缺陷时修订，并更新版本/批准记录。
- `PLAN.md`：修复执行歧义、路径不一致、粒度或依赖问题；保持与 SPEC 一致。
- `SPEC_PROCESS.md`：记录主控预审、冷启动发现、修订前后关键 diff 和负责人判断。
- `AGENT_LOG.md`：记录时间线、智能体类型、输入、prompt、人工干预、提交和 G3 证据。

---

## 提交 1：建立 T04 提交级规划

**提交信息：** `docs: 规划T04冷启动验证步骤`

**修改文件：**

- 修改：`guiding.md`

**内容：**

- [ ] 写明 T04 目标、G3 边界、冷启动隔离规则和文件职责。
- [ ] 将主控预审修复、输入冻结、冷启动试做、问题分类、文档修订、复验、G3 审计和清空规划拆成独立提交。
- [ ] 明确第二个提交先修复已知 T03 问题，不把它们冒充冷启动发现。
- [ ] 为每个提交写明修改范围、验证命令、证据和提交信息。
- [ ] 明确 T04 独立分支和 T05 只能在 G3 通过后开始。

**提交前验证：**

```powershell
git diff --check
git diff -- guiding.md
git status --short
```

预期：只有 `guiding.md` 被修改；没有实现代码或工程文件。

**提交命令：**

```powershell
git add guiding.md
git commit -m "docs: 规划T04冷启动验证步骤"
```

---

## 提交 2：修复 T03 已知计划缺陷

**提交信息：** `docs: 修正实现计划执行歧义`

**修改文件：**

- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`，勾选提交 1–2 的完成项

**必须修复：**

- [ ] T13 的 G4 命令只运行 `Files` 中明确创建的测试路径；不得引用未声明的 `tests/integration/runtime/core-loop.test.ts`。
- [ ] T15 的三项演示命令展开为三个真实路径，不得保留 `demos/mechanisms/<name>.test.ts`。
- [ ] 将同时包含编写测试、实现、运行、评审、提交、清空 guiding 或合并 MR 的复合 Step 拆成单一动作。
- [ ] 每个拆分后的 Step 明确 `(2–5 min)`、执行命令或可观察产物、预期结果。
- [ ] 重点检查 T05、T06、T07、T09、T10、T11、T13、T14、T16、T17、T18、T19、T20 的复合步骤。
- [ ] 两阶段评审、修复 Critical、全量回归、业务提交、更新台账、清空 guiding、等待 Pipeline 和合并 MR 必须分开。
- [ ] 不改变 SPEC 产品范围、接口语义、Txx 分工、依赖 DAG 或主要贡献。

**过程证据：**

- `SPEC_PROCESS.md` 新增“主控预审修订”，逐条记录原问题、修订方式和不扩大范围的理由。
- `AGENT_LOG.md` 记录 T04 启动、当前分支、预审来源、验证命令和第二个提交证据。
- 不修改 `SPEC.md`；这些问题属于 PLAN 内部执行一致性，不是需求变化。

**提交前验证：**

```powershell
git diff --check
$bad=Select-String -Path PLAN.md -Pattern 'tests/integration/runtime/core-loop\.test\.ts|demos/mechanisms/<name>\.test\.ts'; if($bad){$bad; throw "仍有已知路径缺陷"}
$steps=Select-String -Path PLAN.md -Pattern '^- \[ \] \*\*Step [0-9]+ \(2–5 min\):\*\*'; if($steps.Count -lt 120){throw "原子步骤数量不足，需复核拆分"}
Select-String -Path SPEC_PROCESS.md -Pattern "主控预审","路径","复合步骤","不扩大"
git diff --name-only HEAD
```

预期：仅修改四个文档；不存在两个已知错误路径；所有 T05–T20 Step 都显式标注 2–5 分钟，复合收尾动作已拆开。

**提交命令：**

```powershell
git add PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 修正实现计划执行歧义"
```

---

## 提交 3：冻结冷启动协议和输入证据

**提交信息：** `docs: 建立陌生智能体冷启动协议`

**修改文件：**

- 创建：`COLD_START_VALIDATION.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`

**必须记录：**

- [ ] 主开发智能体类型和陌生智能体类型，证明二者不同。
- [ ] 全新会话创建方式、无 memory/历史的检查方法和验证时间。
- [ ] `SPEC.md`、`PLAN.md` 的 commit hash、blob hash、文件 hash 和行数。
- [ ] 提供给陌生智能体的文件清单，明确没有额外文件或口头补充。
- [ ] 原始 prompt：选择 1–2 个 Task 试做；不确定时停止提问；不得猜测。
- [ ] 试做隔离位置和禁止合入正式代码的清理/保留规则。
- [ ] 原始问题记录模板：时间、任务、文件/行、原文、暂停状态、是否继续。
- [ ] 结果分类模板和预期差距比较模板。

**提交前验证：**

```powershell
git diff --check
Select-String -Path COLD_START_VALIDATION.md -Pattern "智能体类型","全新会话","SPEC.md","PLAN.md","hash","原始 prompt","不得猜测","原始问题"
git status --short
```

预期：协议可由另一人复现；此时尚未填写不存在的冷启动结果。

**提交命令：**

```powershell
git add COLD_START_VALIDATION.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 建立陌生智能体冷启动协议"
```

---

## 提交 4：记录陌生智能体首次试做

**提交信息：** `docs: 记录冷启动试做证据`

**修改文件：**

- 修改：`COLD_START_VALIDATION.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`

**执行与记录：**

- [ ] 使用协议中声明的不同类型陌生智能体和全新会话。
- [ ] 仅提交冻结的 SPEC/PLAN，不提供本项目历史、总结或口头解释。
- [ ] 让其自行选择 1–2 个 PLAN Task，并记录选择理由。
- [ ] 原样记录全部疑问、暂停点、错误理解、尝试命令和观察结果。
- [ ] 保存试做产物清单或 diff，但不得提交正式源码。
- [ ] 记录试做停止原因、耗时、已完成步骤和未完成步骤。
- [ ] 主控在试做结束前不得提示已知答案或引导绕过疑问。

**提交前验证：**

```powershell
git diff --check
Select-String -Path COLD_START_VALIDATION.md -Pattern "智能体","选择任务","原始疑问","暂停点","错误理解","停止原因","产物"
git diff --name-only HEAD
```

预期：当前分支仍只有文档改动；试做事实与解释分开记录。

**提交命令：**

```powershell
git add COLD_START_VALIDATION.md AGENT_LOG.md guiding.md
git commit -m "docs: 记录冷启动试做证据"
```

---

## 提交 5：分类冷启动发现并比较预期差距

**提交信息：** `docs: 分析冷启动规约缺陷`

**修改文件：**

- 修改：`COLD_START_VALIDATION.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`

**必须完成：**

- [ ] 将每条发现分类为 SPEC 缺陷、PLAN 缺陷、两者不一致、环境缺口或智能体误读。
- [ ] 为每项分类引用具体文件、行、原始问题和预期行为。
- [ ] 比较试做产物与 PLAN 预期的文件、接口、测试、命令和停止条件。
- [ ] 判断哪些问题会阻塞新鲜 subagent，哪些只是表达偏好。
- [ ] 至少确认并处理一个真实隐含假设或规约缺陷；如果首次试做没有发现，G3 不得通过，必须更换 Task 或重新验证。
- [ ] 对智能体误读给出文本证据，不得为了凑缺陷而修改正确规约。

**提交前验证：**

```powershell
git diff --check
Select-String -Path COLD_START_VALIDATION.md -Pattern "SPEC 缺陷","PLAN 缺陷","两者不一致","环境缺口","智能体误读","预期差距"
Select-String -Path SPEC_PROCESS.md -Pattern "冷启动","证据","采纳","拒绝"
```

预期：每项结论都有原始证据，且至少一个真实缺陷进入修订队列。

**提交命令：**

```powershell
git add COLD_START_VALIDATION.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 分析冷启动规约缺陷"
```

---

## 提交 6：依据冷启动证据修订 SPEC 与 PLAN

**提交信息：** `docs: 修订冷启动暴露的规约缺陷`

**修改文件：**

- 按证据修改：`SPEC.md`
- 按证据修改：`PLAN.md`
- 修改：`COLD_START_VALIDATION.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`

**修订规则：**

- [ ] 只修复已分类并获负责人批准的问题，不顺手扩展功能。
- [ ] 每项修改记录修订前文本、修订后文本、原因、影响的 REQ/US/Txx 和批准结论。
- [ ] SPEC 变更同步版本、追踪矩阵和批准记录；PLAN 变更同步文件、接口、步骤、依赖和验证。
- [ ] 修复后重新扫描路径一致性、类型命名、占位符、原子步骤和需求覆盖。
- [ ] 被拒绝的智能体建议保留拒绝理由，不从记录中删除。

**提交前验证：**

```powershell
git diff --check
$bad=Select-String -Path SPEC.md,PLAN.md -Pattern 'TBD|TODO|待补充|implement later|fill in details|<name>'; if($bad){$bad; throw "规约仍有占位符"}
Select-String -Path SPEC_PROCESS.md -Pattern "修订前","修订后","采纳","拒绝","负责人"
git diff --stat
```

预期：所有修改能追溯到冷启动证据；需求与计划重新一致。

**提交命令：**

```powershell
git add SPEC.md PLAN.md COLD_START_VALIDATION.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 修订冷启动暴露的规约缺陷"
```

---

## 提交 7：复验修订后的冷启动可执行性

**提交信息：** `docs: 验证规约修订有效性`

**修改文件：**

- 修改：`COLD_START_VALIDATION.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`

**复验要求：**

- [ ] 使用另一个全新会话，只提供修订后的 SPEC/PLAN。
- [ ] 重新执行首次试做中受阻的同一 Task/步骤，不提供修订说明。
- [ ] 原始阻塞必须消失，且不得产生新的 Critical 歧义。
- [ ] 对仍存在的问题重新分类；未解决时返回提交 6，不得宣布通过。
- [ ] 比较修订前后提问数量、暂停位置和产物差距，但不伪造效率提升。

**提交前验证：**

```powershell
git diff --check
Select-String -Path COLD_START_VALIDATION.md -Pattern "复验","同一 Task","原始阻塞","新问题","修订前后"
git status --short
```

预期：复验有独立证据，原缺陷确实由文档修订消除。

**提交命令：**

```powershell
git add COLD_START_VALIDATION.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 验证规约修订有效性"
```

---

## 提交 8：完成 T04 审计并批准 G3

**提交信息：** `docs: 完成T04冷启动验证审计`

**修改文件：**

- 修改：`COLD_START_VALIDATION.md`
- 修改：`SPEC.md`
- 修改：`PLAN.md`
- 修改：`SPEC_PROCESS.md`
- 修改：`AGENT_LOG.md`
- 修改：`guiding.md`

**审计清单：**

- [ ] 不同类型智能体、全新会话、仅 SPEC/PLAN、无口头补充均有证据。
- [ ] 1–2 个 Task 的选择、试做、疑问、暂停点、错误理解和产物差距完整。
- [ ] 至少一个真实规约缺陷已修订并通过同 Task 复验。
- [ ] SPEC/PLAN 内部一致，无占位符，T05–T20 路径、接口和验证命令可执行。
- [ ] 负责人逐项批准修订，并在 SPEC/PLAN 写入最新版本与 G3 状态。
- [ ] `AGENT_LOG.md` 记录提交 1–7 hash、验证环境、人工干预和经验。
- [ ] 明确 G3 通过后仅允许从最新 `dev` 创建 T05 独立分支，不在 T04 分支写实现。
- [ ] 明确下一提交只清空 `guiding.md`，随后创建目标为 `dev` 的 T04 MR。

**提交前验证：**

```powershell
git diff --check
git log --oneline dev..HEAD
git diff --name-only dev...HEAD
$bad=Select-String -Path SPEC.md,PLAN.md,COLD_START_VALIDATION.md -Pattern 'TBD|TODO|待补充|implement later|fill in details'; if($bad){$bad; throw "仍有占位符"}
Select-String -Path COLD_START_VALIDATION.md -Pattern "最终结论","G3","通过","复验"
Select-String -Path SPEC_PROCESS.md,AGENT_LOG.md -Pattern "冷启动","修订","人工","G3"
git status --short
```

预期：相对 `dev` 仅有文档变更；G3 结论有完整客观证据。

**提交命令：**

```powershell
git add COLD_START_VALIDATION.md SPEC.md PLAN.md SPEC_PROCESS.md AGENT_LOG.md guiding.md
git commit -m "docs: 完成T04冷启动验证审计"
```

---

## 提交 9：清空 T04 任务规划

**提交信息：** `docs: 清空T04任务规划`

**修改文件：**

- 修改：`guiding.md`，删除全部内容并保持空文件继续受 Git 跟踪

**执行要求：**

- [ ] 确认提交 1–8 已按顺序存在，冷启动、修订、复验和 G3 审计无未完成项。
- [ ] 清空 `guiding.md`，不得删除该文件。
- [ ] 本提交不得夹带其他文件改动。

**提交前验证：**

```powershell
git diff --check
if ((Get-Content -Raw guiding.md).Trim().Length -ne 0) { throw "guiding.md 尚未清空" }
git status --short
```

预期：只有 `guiding.md` 被修改。

**提交命令：**

```powershell
git add guiding.md
git commit -m "docs: 清空T04任务规划"
```

**提交后分支动作：**

```powershell
git log --oneline dev..HEAD
git diff --check dev...HEAD
git status --short
```

预期：T04 的规划与清空历史完整，工作区干净，可以创建 `docs/t04-cold-start-validation -> dev` MR；禁止 squash。

---

## T04 完成判定

- [ ] 冷启动智能体与主开发智能体类型不同，使用全新会话且仅获得 SPEC/PLAN。
- [ ] 1–2 个 Task 的全部疑问、暂停、误读和差距有原始证据。
- [ ] 至少一个真实隐含假设或规约缺陷完成“发现—修订—同 Task 复验”闭环。
- [ ] SPEC/PLAN 的关键 diff、采纳、拒绝和人工批准可追溯。
- [ ] G3 有客观证据通过，正式实现获得放行。
- [ ] 全程未在 T04 分支创建或提交正式实现代码。
- [ ] `guiding.md` 已通过独立末尾提交清空，MR 禁止 squash。
