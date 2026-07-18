# T08 配置、JSON Memory 与脱敏 Trace：精简提交计划

> 当前分支：`feat/t08-config-memory`
>
> 基线：最新 `dev` 提交 `78ccf30`，已包含 T05–T07 及启动前安全收尾。
>
> 总计 5 个提交，不超过 7 个提交。只实现配置、Memory、统一脱敏和本地 Trace，不实现 Agent Loop、反馈重试、真实 Provider、凭据加密、CLI 或 WebUI。

## 目标

为后续 Agent Loop 提供可严格校验的本地配置、可检索的 JSON Memory 和统一脱敏的 JSON Trace；任何 fake Key 都不得以明文进入配置、Memory、Trace 或错误信息。

## 固定文件

- 创建：`packages/harness/src/config.ts`
- 创建：`packages/harness/src/json-memory.ts`
- 创建：`packages/harness/src/redactor.ts`
- 创建：`packages/harness/src/trace.ts`
- 修改：`packages/harness/src/index.ts`
- 修改：`.gitignore`
- 创建：`tests/unit/harness/config.test.ts`
- 创建：`tests/unit/harness/json-memory.test.ts`
- 创建：`tests/unit/harness/redactor.test.ts`
- 创建：`tests/unit/harness/trace.test.ts`
- 收尾修改：`PLAN.md`、`AGENT_LOG.md`、`guiding.md`

## 固定行为

- Config 严格接受 workspace、精确命令规则、最大步数、命令超时、输出上限和 Memory 路径；拒绝未知字段、错误范围、绝对/逃逸存储路径以及任何 Key/secret 字段。
- `MemoryItem` 固定包含 `id`、`kind: convention | recent_result`、`tags`、`content`、`updatedAt`；支持写入、按 id 更新、关键词/标签相关检索和清空。
- Memory 只保存项目约定和短结果摘要，不保存文件正文或完整命令输出；JSON 缺失按空库处理，损坏或结构错误返回稳定错误，不静默覆盖。
- Redactor 接收当前会话提供的敏感值并统一替换为 `[REDACTED]`，同时遮蔽常见 Bearer/API Key 形态；测试只使用 fake Key。
- Trace 使用本地 JSON 记录 `step`、Action、Policy、Observation、状态和停机原因；写入前递归脱敏，读取结果也不得包含 fake Key 明文。
- Memory/Trace 文件和临时写入文件加入 `.gitignore`；不创建数据库。

---

## 提交 1：建立 T08 规划

**提交信息：** `docs: 规划T08配置记忆步骤`

- [x] 明确 T08 目标、非目标、固定文件和数据边界。
- [x] 将 RED、实现、评审记录和清空规划压缩为 5 个提交。
- [x] 明确 Key 不属于配置，Memory 与 Trace 写入前必须统一脱敏。
- [x] 本提交只修改 `guiding.md`。

**验证：**

```powershell
git diff --check
git diff --name-only
```

---

## 提交 2：用 RED 测试冻结配置与持久化行为

**提交信息：** `test: 定义T08配置记忆行为`

- [ ] Config：合法配置成功；未知字段、错误数值、路径逃逸和 Key/secret 字段失败。
- [ ] Memory：空库、写入、更新、相关检索、清空和损坏 JSON 明确失败。
- [ ] Redactor：显式 fake Key、Bearer 和常见 Key 文本被替换，普通内容保持不变。
- [ ] Trace：顺序写入并读取；Action/Observation/停机原因中的 fake Key 全部零明文。
- [ ] 运行聚焦测试并保留正确 RED：T08 模块/导出不存在，而不是测试语法或环境错误。

**RED 命令：**

```powershell
pnpm vitest run tests/unit/harness/config.test.ts tests/unit/harness/json-memory.test.ts tests/unit/harness/redactor.test.ts tests/unit/harness/trace.test.ts
```

---

## 提交 3：实现配置、Memory、脱敏与 Trace

**提交信息：** `feat: 实现T08配置记忆与追踪`

- [ ] 用项目代码实现严格 Config 解析，不引入 schema、数据库或日志框架依赖。
- [ ] 实现 JSON Memory 的原子写入、更新、有限相关检索、清空和损坏文件错误。
- [ ] 实现统一 Redactor，并让 Memory 与 Trace 共用同一脱敏入口。
- [ ] 实现本地 JSON Trace，保留规定字段和明确停机原因。
- [ ] 更新 Harness 公共导出与 `.gitignore`，聚焦测试全部 GREEN。

---

## 提交 4：完成评审、门禁和记录

**提交信息：** `docs: 记录T08验证结果`

- [ ] Spec 检查：逐项核对配置、Memory、Trace、脱敏和零数据库，不实现 T09 以后能力。
- [ ] 质量检查：重点检查原子写入、损坏 JSON、路径限制、检索上限和递归脱敏；修复所有 Critical。
- [ ] 用 fake Key 扫描 T08 测试产物和错误文本，确认零明文。
- [ ] 运行完整门禁，并在 `PLAN.md`、`AGENT_LOG.md` 如实记录 RED/GREEN、评审和验证结果。

**完整门禁：**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

---

## 提交 5：清空 T08 规划

**提交信息：** `docs: 清空T08任务规划`

- [ ] 确认提交 1–4 完成、完整门禁通过、工作区无其他改动。
- [ ] 只清空 `guiding.md` 并提交。
- [ ] 推送分支并创建目标为 `dev` 的 MR；Pipeline passed 后合并，禁止 squash。

**验证：**

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git diff --check
git status --short
```
