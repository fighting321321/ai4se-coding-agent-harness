# T09 反馈重点维度与 Agent Loop：精简提交计划

> 当前分支：`feat/t09-feedback-loop`
>
> 基线：最新 `dev` 提交 `94684f4`，已包含 T05–T08 及 Trace/配置收尾。
>
> 总计 6 个提交，不超过 7 个提交。只实现反馈分类和离线 Agent Loop，不实现真实 Provider、凭据、CLI、网络请求、机制演示或 WebUI。

## 目标

用项目自研代码串起 task → Memory/context → LLM → Action 解析 → Policy/批准 → 单工具执行 → Feedback → 下一轮/停止，并把“失败反馈回灌、最多修正一次、第二次失败停止”做成可由 ScriptedMockLLM 确定性验证的主要贡献。

## 固定文件

- 创建：`packages/harness/src/feedback.ts`
- 创建：`packages/harness/src/agent-loop.ts`
- 修改：`packages/harness/src/index.ts`
- 创建：`tests/unit/harness/feedback.test.ts`
- 创建：`tests/integration/harness/agent-loop.test.ts`
- 收尾修改：`PLAN.md`、`AGENT_LOG.md`、`guiding.md`

## 固定接口与行为

```ts
type FeedbackCategory = "pass" | "fail" | "timeout" | "environment_error";

interface FeedbackResult {
  category: FeedbackCategory;
  observation: string;
}

type RunStatus = "completed" | "blocked" | "failed" | "max_steps";

interface RunResult {
  status: RunStatus;
  summary: string;
  steps: number;
  trace: readonly TraceEntry[];
}
```

- Feedback 把成功、非零退出、超时和环境/执行异常稳定分类，Observation 必须短、可脱敏并进入下一轮 `LLMInput.observations`。
- AgentLoop 依赖注入 `LLMProvider`、`JsonMemory`、`Dispatcher`、`JsonTrace` 和最大步数；默认最大 8 步，不使用现成 Agent Runner。
- 每轮最多调用一次 Provider、解析一个 Action、执行一个 handler，并写一条脱敏 Trace。
- `finish` 直接返回 completed；Policy deny/未批准返回 blocked；Provider、解析、Memory/Trace 或环境错误返回 failed；达到上限返回 max_steps。
- 第一次业务 fail 允许进入下一轮，必须把失败 Observation 回灌；第二次业务 fail 立即 failed，不调用第三次工具。
- 危险动作、deny 和未批准动作的工具调用次数必须为零；不自动重试任何副作用。

---

## 提交 1：建立 T09 规划

**提交信息：** `docs: 规划T09反馈循环步骤`

- [x] 明确 T09 目标、非目标、固定文件和接口。
- [x] 将 Feedback、Loop RED/GREEN、评审记录和清空规划压缩为 6 个提交。
- [x] 明确一次修正、第二次失败停机和危险动作零调用。
- [x] 本提交只修改 `guiding.md`。

**验证：**

```powershell
git diff --check
git diff --name-only
```

---

## 提交 2：完成 Feedback RED → GREEN

**提交信息：** `feat: 实现T09反馈分类`

- [ ] 先在 `feedback.test.ts` 覆盖 pass、非零退出 fail、超时、环境异常和摘要脱敏/截断。
- [ ] 运行测试确认因 Feedback 模块/导出不存在而 RED。
- [ ] 最小实现 `feedback.ts`，分类只依据结构化结果，不分析 Prompt。
- [ ] 同一聚焦测试全部 GREEN 后提交测试与实现。

**聚焦命令：**

```powershell
pnpm vitest run tests/unit/harness/feedback.test.ts
```

---

## 提交 3：用 RED 集成测试冻结 Agent Loop

**提交信息：** `test: 定义T09反馈循环行为`

- [ ] 第一次工具失败进入下一轮，第二次 Action 改变并成功 finish；断言失败 Observation 出现在第二次 LLM 输入。
- [ ] 连续两次业务失败后 failed，Provider/工具均不发生第三次调用。
- [ ] 覆盖 finish、deny、未批准、最大步数、解析失败、Provider/环境错误和危险动作零调用。
- [ ] 覆盖每轮 Trace 顺序、状态和脱敏，不使用网络或真实 Key。
- [ ] 运行集成测试并保存因 AgentLoop 不存在产生的正确 RED。

**RED 命令：**

```powershell
pnpm vitest run tests/integration/harness/agent-loop.test.ts
```

---

## 提交 4：实现并重构 Agent Loop

**提交信息：** `feat: 实现T09自研反馈循环`

- [ ] 组装任务、相关 Memory 与 Observation，调用一次 Provider 并严格解析一个 Action。
- [ ] 复用 Dispatcher 的 Policy/Approval 零副作用保障，不复制 T07 的安全规则。
- [ ] 工具结果经 Feedback 分类后写入 Trace；第一次 fail 回灌，第二次 fail 确定性停止。
- [ ] 实现 completed/blocked/failed/max_steps RunResult 和明确停机原因。
- [ ] 集成测试与 Feedback 单测全部 GREEN；轻量重构后保持行为不变并导出公共接口。

**GREEN 命令：**

```powershell
pnpm vitest run tests/unit/harness/feedback.test.ts tests/integration/harness/agent-loop.test.ts
```

---

## 提交 5：完成评审、门禁和记录

**提交信息：** `docs: 记录T09验证结果`

- [ ] Spec 检查：逐项核对反馈分类、回灌、一次修正、第二次停机、四种 RunStatus 和 Trace，不实现 T10 以后能力。
- [ ] 质量检查：重点检查调用计数、错误分支、最大步数、Memory/Trace 失败和 fake Key 脱敏；修复所有 Critical。
- [ ] 运行完整门禁，并在 `PLAN.md`、`AGENT_LOG.md` 如实记录 RED/GREEN、评审和验证结果。

**完整门禁：**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

---

## 提交 6：清空 T09 规划

**提交信息：** `docs: 清空T09任务规划`

- [ ] 确认提交 1–5 完成、完整门禁通过、工作区无其他改动。
- [ ] 只清空 `guiding.md` 并提交。
- [ ] 推送分支并创建目标为 `dev` 的 MR；Pipeline passed 后合并，禁止 squash。

**验证：**

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git diff --check
git status --short
```
