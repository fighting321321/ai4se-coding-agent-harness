# AI4SE Interactive CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Release tarball 从仅支持离线 smoke 的内核包升级为只解锁一次凭据、可连续运行任务的终端 Agent。

**Architecture:** 将 API 中的 Harness 装配下沉为 `@ai4se/harness` 的共享 runner；新增与终端适配器解耦的 REPL 状态机；源码 CLI 和 tarball bin 共用同一命令分发。保留一次性 `--task` 与 WebUI，不新增运行时依赖。

**Tech Stack:** Node.js 24.14.0、TypeScript 6、pnpm 11.14.0、Vitest 4、Node readline/TTY。

## Global Constraints

- 仅在 `dev` 工作，不新建 Txx 分支，总提交数不超过 7。
- 所有实现先写失败测试并观察 RED，再写最小 GREEN。
- API Key 与主密码不得进入参数、配置、日志、Trace、Memory、测试输出或 Git。
- Windows 项目门禁只通过 `powershell -NoProfile -File .\scripts\project-env.ps1 <task>` 执行。
- 保持 `smoke`、一次性 `--task`、本地 WebUI 和现有配置格式兼容。

---

### Task 1: 共享 Runner 与会话状态机 RED

**Files:**
- Create: `tests/unit/harness/interactive-session.test.ts`
- Modify: `tests/integration/api/local-web-server.test.ts`

**Interfaces:**
- Produces desired API: `runInteractiveSession(options, dependencies): Promise<number>`。
- Session dependencies provide `readSecret`、`readLine`、`askApproval`、`writeOut`、`writeError`、`clearScreen` and injectable `runTask`。

- [ ] **Step 1:** 写测试要求一次解锁后连续两个任务只调用一次 `readSecret`，两个任务都收到相同 Key，但输出和 Trace 不含 Key。
- [ ] **Step 2:** 写测试要求 `/help`、`/status`、`/trace`、`/clear`、空输入和 `/exit` 不调用 Provider runner。
- [ ] **Step 3:** 写测试要求两个写入审批不缓存第一次回答，并验证稳定 Trace 格式。
- [ ] **Step 4:** 通过统一 `test` 观察新测试因导出不存在而 RED。
- [ ] **Step 5:** 提交 `test: 定义会话式CLI交互契约`。

### Task 2: 共享 Runner 与会话状态机 GREEN

**Files:**
- Create: `packages/harness/src/run-task.ts`
- Create: `packages/harness/src/interactive-session.ts`
- Modify: `packages/harness/src/index.ts`
- Modify: `apps/api/src/run-task.ts`

**Interfaces:**
- `loadHarnessTaskConfig(configPath)` returns validated configuration or stable read/validation error。
- `runHarnessTask(options)` remains compatible with API and one-shot CLI callers。
- `runInteractiveSession` owns one decrypted Key per process and one REPL loop。

- [ ] **Step 1:** 将现有 task runner 装配下沉到 Harness，并让 API 文件只做兼容导出。
- [ ] **Step 2:** 实现 session startup：配置预检、一次隐藏解锁、无凭据稳定失败。
- [ ] **Step 3:** 实现普通任务循环、summary/Trace 输出、逐动作审批和错误后继续。
- [ ] **Step 4:** 实现五个内置命令、空输入与 EOF/Ctrl+C 退出语义。
- [ ] **Step 5:** 运行统一 `test`，修正既有契约直到全绿。
- [ ] **Step 6:** 提交 `feat: 实现单次解锁的Agent终端会话`。

### Task 3: 可分发命令入口与打包 RED/GREEN

**Files:**
- Modify: `apps/api/src/cli.ts`
- Modify: `apps/api/src/cli-entry.ts`
- Modify: `packages/harness/bin/ai4se-harness.mjs`
- Modify: `packages/harness/package.json`
- Modify: `tests/integration/api/cli.test.ts`
- Modify: `tests/integration/distribution/package-smoke.test.ts`

**Interfaces:**
- `ai4se-harness start [--config path]` enters the REPL。
- `ai4se-harness credentials <status|init|update|clear>` and `smoke` remain available。
- `ai4se-harness --help` is offline and credential-free。

- [ ] **Step 1:** 扩展 CLI 与 tarball 测试，观察 `start`、凭据子命令、帮助和包版本 `0.2.0` RED。
- [ ] **Step 2:** 把共享命令分发移入 Harness 导出，源码入口补齐 `readLine`/`clearScreen` 适配。
- [ ] **Step 3:** 将 tarball bin 改为真实 CLI 适配器并保留 `smoke`。
- [ ] **Step 4:** 更新包版本和所有精确 tarball 断言；在全新目录验证安装、help、smoke 与无凭据 start。
- [ ] **Step 5:** 运行统一 test、lint、typecheck、build。
- [ ] **Step 6:** 提交 `feat: 发布可交互的Harness CLI`。

### Task 4: 文档、真人验收与最终产物

**Files:**
- Modify: `README.md`
- Modify: `packages/harness/README.md`
- Modify: `SPEC.md`
- Modify: `PLAN.md`
- Modify: `AGENT_LOG.md`
- Modify: `.ai4se/作业提交材料/00-提交说明-请先阅读.md`（Git 忽略，本地交付）

**Interfaces:**
- Documentation presents `ai4se-harness start` as primary product entry。
- Release target is `v1.1.0` with `ai4se-harness-0.2.0.tgz`。

- [ ] **Step 1:** 更新用户命令、会话示例、一次解锁边界、退出清理和已知限制。
- [ ] **Step 2:** 使用本地测试 Key 真人验证连续两个任务只输入一次主密码；仅记录非敏感结果。
- [ ] **Step 3:** 运行统一 test、lint、typecheck、build、demo、audit。
- [ ] **Step 4:** 提交 `docs: 完成会话式CLI交付说明`。
- [ ] **Step 5:** 重新生成 final source ZIP、`0.2.0` tarball、SHA-256，并从提交文件夹独立验证。
- [ ] **Step 6:** 合并 `dev → main`，等待最终 Pipeline passed，再创建 GitLab `v1.1.0` Release。

## Commit Budget

1. `docs: 设计会话式Agent CLI`（已完成）
2. `docs: 规划会话式Agent CLI实现`
3. `test: 定义会话式CLI交互契约`
4. `feat: 实现单次解锁的Agent终端会话`
5. `feat: 发布可交互的Harness CLI`
6. `docs: 完成会话式CLI交付说明`

预留第 7 个提交仅用于最终审查发现的必要修复，不用于扩展范围。
