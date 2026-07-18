# T06 最小决策与分发内核：精简提交计划

> 当前分支：`feat/t06-minimal-kernel`
>
> 基线：最新 `dev` 的 `76e3538`；T05 测试基线 2/2 通过。
>
> 执行方式：一个新鲜 subagent 负责实现，T06 对话负责 TDD、评审和验证。总计 5 个提交，不实现 T07 工具、Policy、Memory、Agent Loop 或真实 Provider。

## 目标

建立四类严格 Action、单次 LLM 调用接口、脚本化 mock、严格解析器和单动作 Dispatcher，使后续工具与 Agent Loop 有一个完全离线、可注入、可确定性测试的最小内核。

## 固定文件

- 创建：`packages/harness/src/action.ts`
- 创建：`packages/harness/src/llm-provider.ts`
- 创建：`packages/harness/src/scripted-mock-llm.ts`
- 创建：`packages/harness/src/action-parser.ts`
- 创建：`packages/harness/src/dispatcher.ts`
- 修改：`packages/harness/src/index.ts`
- 创建：`tests/unit/harness/action-parser.test.ts`
- 创建：`tests/unit/harness/scripted-mock-llm.test.ts`
- 创建：`tests/unit/harness/dispatcher.test.ts`
- 收尾修改：`PLAN.md`、`AGENT_LOG.md`、`guiding.md`

## 固定接口

```ts
export type Action =
  | { type: "read_file"; path: string }
  | { type: "write_file"; path: string; content: string }
  | { type: "run_command"; executable: string; args: readonly string[] }
  | { type: "finish"; summary: string };

export interface LLMInput {
  task: string;
  context: readonly string[];
  observations: readonly string[];
}

export interface LLMOutput {
  raw: unknown;
}

export interface LLMProvider {
  complete(input: LLMInput): Promise<LLMOutput>;
}
```

Parser 返回 `{ ok: true, value: Action } | { ok: false, error: { code: "ACTION_PARSE_FAILED", message: string } }`。Dispatcher 的错误码只使用 `TOOL_UNKNOWN` 与 `TOOL_EXECUTION_FAILED`；每次 `execute()` 最多调用一个已注册 handler。

---

## 提交 1：建立 T06 规划

**提交信息：** `docs: 规划T06最小内核步骤`

- [x] 明确 T06 目标、非目标、固定文件和接口。
- [x] 将 RED、GREEN、评审记录和清空规划压缩为 5 个提交。
- [x] 明确 `run_command` 使用 executable + args，不接受 Shell 命令字符串。
- [x] 确认本提交只修改 `guiding.md`。

**验证：**

```powershell
git diff --check
git diff --name-only
```

---

## 提交 2：用 RED 测试冻结内核行为

**提交信息：** `test: 定义T06最小内核行为`

- [ ] `scripted-mock-llm.test.ts`：断言脚本按顺序返回、调用输入被只读复制、脚本耗尽抛出 `ScriptedMockExhaustedError`。
- [ ] `action-parser.test.ts`：四类合法 Action 解析成功；未知类型、缺失字段、多余字段、字符串命令或非字符串 args 返回 `ACTION_PARSE_FAILED`。
- [ ] `dispatcher.test.ts`：注册 handler 后只调用一次；未注册类型返回 `TOOL_UNKNOWN`；handler 异常转换为 `TOOL_EXECUTION_FAILED`。
- [ ] 运行聚焦测试并保存正确 RED：模块或导出不存在，而不是测试语法错误。

**RED 命令：**

```powershell
pnpm vitest run tests/unit/harness/action-parser.test.ts tests/unit/harness/scripted-mock-llm.test.ts tests/unit/harness/dispatcher.test.ts
```

---

## 提交 3：实现最小内核并获得 GREEN

**提交信息：** `feat: 实现T06最小决策与分发内核`

- [ ] 按固定接口实现 Action、LLM 类型与 `ScriptedMockLLM`，不增加重试、网络或循环。
- [ ] 用项目代码严格检查对象字段和类型，不为 T06 引入额外 schema 依赖。
- [ ] 实现名称唯一的 handler 注册与单动作分发，异常只转结构化错误。
- [ ] 从 `packages/harness/src/index.ts` 导出全部 T06 公共接口。
- [ ] 聚焦测试全部 GREEN，并运行一次轻量重构，保持行为不变。

**GREEN 命令：**

```powershell
pnpm vitest run tests/unit/harness/action-parser.test.ts tests/unit/harness/scripted-mock-llm.test.ts tests/unit/harness/dispatcher.test.ts
```

---

## 提交 4：完成评审、门禁和记录

**提交信息：** `docs: 记录T06验证结果`

- [ ] Spec 检查：确认没有实现文件工具、Policy、Memory、Agent Loop、真实 Provider 或网络调用。
- [ ] 质量检查：确认输入复制、严格字段、错误稳定、handler 恰一次调用；修复所有 Critical。
- [ ] 运行完整门禁并记录退出结果。
- [ ] 在 `PLAN.md` 和 `AGENT_LOG.md` 记录 T06 提交、RED/GREEN、评审、人工修改和验证结果。

**完整门禁：**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

---

## 提交 5：清空 T06 规划

**提交信息：** `docs: 清空T06任务规划`

- [ ] 确认提交 1–4 完成、完整门禁通过、无未提交改动。
- [ ] 只清空 `guiding.md` 并提交。
- [ ] 推送分支、创建目标为 `dev` 的 MR；Pipeline passed 后合并，禁止 squash。

**验证：**

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git diff --check
git status --short
```
