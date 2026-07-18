# T07 受限工具、治理与最小批准：精简提交计划

> 当前分支：`feat/t07-safe-tools-policy`
>
> 基线：最新 `dev` 合并提交 `cdcc01f`，其中已包含完整 T06。
>
> 总计 6 个提交，不超过 7 个提交。只实现受限文件/命令工具、Policy 与一次批准，不实现 Memory、Trace、Agent Loop、真实 Provider 或 WebUI。

## 目标

为 T06 的 Action 与 Dispatcher 增加最小安全执行层：所有路径限制在 workspace，命令只能按 executable + args 白名单执行，危险动作由确定性 Policy 拒绝，需要批准的写入在明确同意前零调用。

## 固定文件

- 创建：`packages/harness/src/path-guard.ts`
- 创建：`packages/harness/src/file-tools.ts`
- 创建：`packages/harness/src/command-tool.ts`
- 创建：`packages/harness/src/policy.ts`
- 创建：`packages/harness/src/approval.ts`
- 修改：`packages/harness/src/dispatcher.ts`
- 修改：`packages/harness/src/index.ts`
- 创建：`tests/unit/harness/path-guard.test.ts`
- 创建：`tests/unit/harness/file-tools.test.ts`
- 创建：`tests/unit/harness/command-tool.test.ts`
- 创建：`tests/unit/harness/policy.test.ts`
- 创建：`tests/unit/harness/approval.test.ts`
- 收尾修改：`PLAN.md`、`AGENT_LOG.md`、`guiding.md`

## 固定行为

- Path Guard 仅接受 workspace 内的相对路径；拒绝绝对路径、`..`、`.env`/凭据文件和经符号链接逃逸的真实路径。
- File Tools 只通过 Path Guard 读写 UTF-8 文本，不自行绕过路径检查。
- Command Tool 只调用 `spawn(executable, args, { shell: false })`；使用可注入白名单，默认超时 60 秒，stdout + stderr 合计最多 32 KiB。
- Policy 决策只有 `allow | ask | deny`：读取与结束 allow，写入 ask，Shell 启动器、删除类命令和非白名单命令 deny。
- Approval 使用可注入的异步确认函数；每个 ask 只询问一次，拒绝或缺少批准器时不调用 handler。
- Dispatcher 保留 T06 单动作分发语义，并增加稳定的治理/批准错误结果；所有 deny 和未批准路径的 handler 调用次数必须为零。

---

## 提交 1：建立 T07 规划

**提交信息：** `docs: 规划T07安全工具步骤`

- [x] 明确目标、非目标、固定文件和安全边界。
- [x] 将 RED、工具、治理、评审和清空规划压缩为 6 个提交。
- [x] 明确命令禁止 Shell 字符串，批准前副作用为零。
- [x] 本提交只修改 `guiding.md`。

**验证：**

```powershell
git diff --check
git diff --name-only
```

---

## 提交 2：用 RED 测试冻结安全边界

**提交信息：** `test: 定义T07安全工具行为`

- [ ] Path Guard：覆盖正常相对路径、绝对路径、`..`、敏感文件和符号链接逃逸。
- [ ] File Tools：覆盖安全读写以及非法路径零文件副作用。
- [ ] Command Tool：覆盖白名单执行、非白名单、Shell 启动器、超时和 32 KiB 截断。
- [ ] Policy/Approval：覆盖 allow/ask/deny、拒绝批准以及批准前 handler 零调用。
- [ ] 运行聚焦测试并保留正确 RED：缺少 T07 模块/导出，而非测试语法或环境错误。

**RED 命令：**

```powershell
pnpm vitest run tests/unit/harness/path-guard.test.ts tests/unit/harness/file-tools.test.ts tests/unit/harness/command-tool.test.ts tests/unit/harness/policy.test.ts tests/unit/harness/approval.test.ts
```

---

## 提交 3：实现受限文件与命令工具

**提交信息：** `feat: 实现T07受限工具`

- [ ] 实现 Path Guard 与 UTF-8 File Tools，所有文件访问先完成真实路径检查。
- [ ] 实现 Command Tool，固定 `shell: false`、白名单、60 秒超时和 32 KiB 输出上限。
- [ ] 错误使用稳定代码和可理解信息，不泄漏凭据或无界输出。
- [ ] 从 Harness 入口导出公共类型与实现。
- [ ] 只运行对应工具测试并获得 GREEN。

---

## 提交 4：实现 Policy、批准与安全分发

**提交信息：** `feat: 实现T07治理与批准`

- [ ] 实现确定性 `allow | ask | deny` Policy，不把安全判断放进 Prompt。
- [ ] 实现一次异步明确批准；缺少批准器、拒绝或确认异常均不执行工具。
- [ ] 将 Policy/Approval 接入 Dispatcher，同时保持 T06 既有测试兼容。
- [ ] 断言危险动作、未批准写入和未知工具的 handler 调用次数均为零。
- [ ] 运行全部 T07 聚焦测试并获得 GREEN。

---

## 提交 5：完成评审、门禁和记录

**提交信息：** `docs: 记录T07验证结果`

- [ ] Spec 检查：逐项核对路径、命令、Policy、批准和零副作用，不实现 T08 以后能力。
- [ ] 质量检查：重点检查 Windows 路径、符号链接、子进程终止、输出上限和异常分支；修复所有 Critical。
- [ ] 运行一次完整门禁，并在 `PLAN.md`、`AGENT_LOG.md` 如实记录 RED/GREEN、评审和验证结果。

**完整门禁：**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

---

## 提交 6：清空 T07 规划

**提交信息：** `docs: 清空T07任务规划`

- [ ] 确认提交 1–5 完成、完整门禁通过、工作区无其他改动。
- [ ] 只清空 `guiding.md` 并提交。
- [ ] 推送分支并创建目标为 `dev` 的 MR；Pipeline passed 后合并，禁止 squash。

**验证：**

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git diff --check
git status --short
```
