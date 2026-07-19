# T10 安全凭据、真实 Provider、CLI 与三项演示：精简提交计划

> 当前分支：`feat/t10-cli-provider-demo`
>
> 基线：`dev` 提交 `279a2a8`，已包含 T05–T09 和反馈循环收尾；基线测试 16/16 文件、124/124 用例通过。
>
> 总计 6 个提交，不超过 7 个。只实现课程最低要求，不增加数据库、多 Provider、在线服务、复杂审批、T11 WebUI 或 T12 分发文档。

## 目标

完成本地可用的最小入口：主密码保护的加密 API Key、一次 OpenAI-compatible Chat Completions 调用、`pnpm agent --task "..."`、凭据 init/status/update/clear，以及一个完全离线且失败时退出非零的 `pnpm demo`。真实学校 API 只允许负责人本地 smoke，不进入自动测试或仓库证据。

## 固定边界

- Node 24、pnpm 11、TypeScript strict；优先使用 Node 内置 `crypto`、`fetch`、TTY/stdio 和 HTTP 测试能力，不新增运行时依赖。
- 凭据文件默认放在被忽略的 `.ai4se/credentials.json`；只保存版本、salt、12-byte nonce、tag 和密文。
- 主密码使用 `scrypt` 派生 256 位密钥，正文使用 AES-256-GCM；主密码和 API Key 不进入参数、普通配置、日志、Trace、Memory、测试快照或错误消息。
- Provider 每次 `complete()` 只发送一次 Chat Completions 请求，不包含循环、工具、治理或自动重试；401、429、5xx、无效响应和网络错误返回稳定且不泄密的错误。
- CLI 只负责解析本地命令、隐藏录入和组装现有 Harness；AgentLoop 继续拥有循环与 Policy/Approval。
- 三项演示全部使用 `ScriptedMockLLM` 和 fake 数据：治理零调用、首次失败后改动作成功、第二次失败确定性停机。

## 预计文件

- 创建：`packages/harness/src/credential-store.ts`
- 创建：`packages/harness/src/openai-compatible-provider.ts`
- 创建：`apps/api/src/cli.ts`
- 创建：`tests/unit/harness/credential-store.test.ts`
- 创建：`tests/unit/harness/openai-compatible-provider.test.ts`
- 创建：`tests/integration/api/cli.test.ts`
- 创建：`tests/integration/demos/mechanisms.test.ts`
- 修改：`packages/harness/src/config.ts`、`packages/harness/src/index.ts`
- 修改：根/API/Harness package scripts 或依赖声明、必要的 TypeScript 配置和锁文件
- 收尾修改：`PLAN.md`、`AGENT_LOG.md`、`guiding.md`

---

## 提交 1：建立 T10 规划

**提交信息：** `docs: 规划T10本地运行与演示步骤`

- [x] 固定 T10 的课程最低范围、文件、六个提交和安全停止线。
- [x] 明确真实 Key 不进入 Git/测试/参数，真实 API 结果不得伪造。
- [x] 明确 TDD、聚焦验证、完整门禁和三个离线演示。
- [x] 本提交只修改 `guiding.md`。

**验证：**

```powershell
git diff --check
git diff --name-only
```

---

## 提交 2：完成加密凭据 RED → GREEN

**提交信息：** `feat: 实现T10加密凭据存储`

- [ ] 先测试缺失状态、init/read roundtrip、update、clear、错误主密码、篡改密文/nonce/tag 和落盘零明文；确认 CredentialStore 尚不存在产生 RED。
- [ ] 最小实现版本化凭据文档、随机 salt/nonce、`scrypt` 256-bit key、AES-256-GCM、原子写入和稳定错误码。
- [ ] 状态只返回 configured/unconfigured；损坏或认证失败不得返回明文、不得静默覆盖旧文件。
- [ ] 导出公共接口，并确保 `.ai4se/credentials.json` 已被忽略。

**聚焦命令：**

```powershell
pnpm vitest run tests/unit/harness/credential-store.test.ts
```

---

## 提交 3：完成 Provider 与本地 CLI RED → GREEN

**提交信息：** `feat: 实现T10兼容Provider与CLI`

- [ ] 先用本地 HTTP stub 覆盖请求方法/鉴权/模型/消息、单请求成功、401、429、5xx、网络错误、无效 JSON/响应结构和错误脱敏；确认 RED。
- [ ] 最小实现 `OpenAICompatibleProvider`：把 LLMInput 转成一次 Chat Completions 请求，把唯一响应内容解析为 Action 原始值；不自动重试。
- [ ] 为普通配置补齐非敏感 Provider base URL/model 配置，继续拒绝 API Key/secret 字段和未知字段。
- [ ] 为 CLI 写可注入、可测试的参数/stdio 边界；支持凭据 init/status/update/clear，密码与 Key 隐藏录入且不允许命令参数传入。
- [ ] 支持 `pnpm agent --task "..."` 读取配置和加密凭据，组装现有 Memory、Trace、Policy、Dispatcher、工具、Approval 和 AgentLoop；批准只在当前 CLI 会话询问一次。
- [ ] 仅做必要的 package/tsconfig/lockfile 调整；测试不得访问公网或真实学校 API。

**聚焦命令：**

```powershell
pnpm vitest run tests/unit/harness/openai-compatible-provider.test.ts tests/integration/api/cli.test.ts tests/unit/harness/config.test.ts
```

---

## 提交 4：完成三项离线机制演示

**提交信息：** `test: 添加T10三项机制演示`

- [ ] 用真实 Harness 组装和 ScriptedMockLLM 自动断言：危险删除/敏感文件被阻断且 handler 零调用。
- [ ] 自动断言：第一次命令失败摘要进入下一轮，mock 改变 Action 后成功 finish。
- [ ] 自动断言：连续第二次业务失败立即停止，不发生第三次 Provider 或工具调用。
- [ ] 新增根 `pnpm demo`，只运行演示测试；任一断言失败时进程退出非零，全程离线、仅用 fake Key。
- [ ] 同时运行 T10 聚焦测试，防止 CLI/Provider/凭据与演示组装脱节。

**聚焦命令：**

```powershell
pnpm demo
pnpm vitest run tests/unit/harness/credential-store.test.ts tests/unit/harness/openai-compatible-provider.test.ts tests/integration/api/cli.test.ts tests/integration/demos/mechanisms.test.ts
```

---

## 提交 5：完成审查、门禁和记录

**提交信息：** `docs: 记录T10验证结果`

- [ ] Spec 检查：逐项核对隐藏录入、加密文件、状态/更新/清除、单次 Provider、CLI、三演示和真实 Key 零泄露；不扩展 T11/T12。
- [ ] 质量/安全检查：重点检查 nonce/salt 随机性、认证失败、原子写入、请求次数、HTTP 错误脱敏、CLI 参数泄密、批准零副作用和 Windows 11 路径。
- [ ] 修复所有 Critical；其他问题只在确有必要时处理，避免课程作业过度工程化。
- [ ] 运行完整门禁和 `pnpm demo`，更新 `PLAN.md`、`AGENT_LOG.md`，如实记录 RED/GREEN、评审、验证和未执行真实 API smoke 的事实。

**完整门禁：**

```powershell
pnpm test
pnpm demo
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

---

## 提交 6：清空 T10 规划

**提交信息：** `docs: 清空T10任务规划`

- [ ] 确认提交 1–5 完成，完整门禁通过，分支总提交数不超过 7，工作区无无关改动。
- [ ] 只清空 `guiding.md` 并提交。
- [ ] 推送 `feat/t10-cli-provider-demo`，创建目标为 `dev` 的 MR；Pipeline passed 后合并，禁止 squash。

**验证：**

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git diff --check
git status --short
```
