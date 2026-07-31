# Coding Agent Harness

> **开发状态（T16）：** `v1.1.0` 仍只是已发布基线，完整 Harness Gate 保持打开。T13–T16 已补齐短期会话、长期 Memory、Skill/MCP/Hooks、串行受限子 Agent、写后反馈传感器和教学级 Checkpoint；后续仍需由 T17 完成真实 Provider、完整 Trace、tarball 与 `v2.0.0` Release 验收。完整差距与顺序见 [`FULL_HARNESS_REASSESSMENT.md`](docs/assessments/FULL_HARNESS_REASSESSMENT.md)。

一个面向课程学习的、可确定性验证的 Coding Agent Harness。它把可替换的 LLM 补全放进由 TypeScript 代码实现的工具边界、策略、记忆、反馈和 Trace 中，并提供可连续输入任务的终端 Agent；它不是线上多用户平台。

## 30 秒了解项目

如果你想理解「Agent 怎样安全地改代码」，这个项目提供一个可运行的最小答案：Agent 只能选择严格定义的动作，在工作区和命令白名单内执行；危险路径、Shell 与删除类命令会在副作用发生前被拒绝；验证失败的摘要会回到下一轮上下文，驱动一次受限修正；运行过程会形成脱敏的结构化 Trace。核心机制都可以用离线 mock LLM 测试，无需真实 API Key。

目标用户是学习 Agent 工程机制的学生或个人开发者，以及需要通过代码、测试与演示评审实现真实性的教师和助教。

## 最小架构与数据流

```text
CLI / 本地 Web
      |
      v
apps/api ─────────────> packages/harness
  本地入口                  Action、Provider、工具、治理、记忆、反馈、循环
      ^
      | /api/runs（仅本机回环）
apps/web
  静态 mock：脱敏架构演示
  本地模式：一次运行请求
```

真实本地运行的数据流为：CLI 从本地配置读取限制并从系统凭据保险库读取 Key，自动装配当前作用域的规则、Skill 名片、内建工具和 MCP 名片；Skill 正文只有在模型明确发出 `load_skill` 后才进入上下文。每项任务只在首次 Provider 调用前检索相关长期 Memory，再把它与完整短期消息序列交给 Provider。工具 Action 依次经过 Policy、必要 Approval、`PreToolUse`、统一分发和 `PostToolUse`；明确的单文件写入在执行前建立受控 Checkpoint，成功写入后按稳定顺序运行结构化 Sensor，失败时只恢复已纳入快照的文件。父 Agent 可串行委派使用独立短期上下文和最小工具集的子 Agent，父子共享总步骤预算且父会话只接收脱敏限长摘要。`SessionStart` / `SessionEnd` 覆盖会话边界。达到字符预算时上下文确定性压缩，完成结果在会话收尾时原子固化。

Harness 的六个维度及其对应实现是：

| 维度 | 主要职责 |
| --- | --- |
| 决策封装 | `AgentLoop` 组织完整会话消息、相关记忆和 Observation，并调用单次 Provider 补全。 |
| 工具 | 受限文件读写与命令执行；命令使用可执行文件和参数数组，不拼接 Shell 字符串。 |
| 记忆 | 完整短期会话与确定性压缩；本地 JSON 长期 Memory 按任务检索，只固化脱敏、限长、去重的明确约定和完成摘要。 |
| 治理 | `PolicyEngine` 对动作给出 `allow`、`ask` 或 `deny`，审批在副作用前发生。 |
| 反馈 | 工具结果及写后 test/lint/typecheck Sensor 分类为可供下一轮使用的脱敏 Observation；失败写入触发对应单文件恢复。 |
| 配置 | JSON 配置校验工作区、白名单、结构化 Sensor、步数、超时、输出上限、上下文预算、Memory 和 Provider；其中不允许 API Key。 |

扩展能力采用教学级最小边界：`.ai4se/skills/<name>/SKILL.md` 只在命中后安全读取；MCP 仅提供可注入连接、发现、调用和离线 `MockMcpConnection`，没有生产协议客户端，也不会连接真实外部服务。MCP 名片始终标记为 `external`，每次调用固定进入 `ask`，不会伪称受本地 PathGuard 或命令白名单保护。

项目的主要贡献是反馈闭环：第一次业务失败的脱敏 Observation 会回灌给下一次决策；最多允许一次自动修正，第二次连续业务失败立即停止。因此「失败类型、失败证据、修正次数和停机条件」都由代码强制，而不是由提示词约定。

## 作业交付清单

- 设计与计划：[`SPEC.md`](SPEC.md)、[`PLAN.md`](PLAN.md)、[`SPEC_PROCESS.md`](SPEC_PROCESS.md)。
- 过程与反思：[`AGENT_LOG.md`](AGENT_LOG.md)、[`COLD_START_VALIDATION.md`](docs/assessments/COLD_START_VALIDATION.md)、[`REFLECTION.md`](REFLECTION.md)。
- 实现与测试：`packages/harness` 自研内核、`apps/api` CLI/本地 API、`apps/web` 本地 WebUI，以及 mock LLM 单元测试和三项机制演示。
- 持续集成：`.gitlab-ci.yml` 中精确名为 `unit-test` 的作业，执行测试、lint、类型检查、构建、演示、打包和凭据审计。
- 托管分发：[GitLab v1.1.0 Release](https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.1.0) 与 `ai4se-harness-0.2.0.tgz`；原 v1.0.0 Release 保留为首版交付记录。

## 前提与源码安装

首版只支持 Node.js `>=24.0.0 <25.0.0` 和 pnpm `11.14.0`。CI 使用 Linux Node 24；本地主要验收平台为 Windows 11。仓库提供统一的 PowerShell 环境入口，它会定位并校验 Node `24.14.0` 与 pnpm `11.14.0`，避免误用系统 Node 20：

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 versions
powershell -NoProfile -File .\scripts\project-env.ps1 install
```

`install` 内部执行 `pnpm install --frozen-lockfile`，不会重算锁文件。默认会从当前 Codex runtime、`AI4SE_NODE` 与 `AI4SE_PNPM_CLI` 中选择精确版本；找不到时会明确失败，而不是回退到不兼容的 Node 20。

## 检查、构建与离线机制演示

在仓库根目录运行：

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 all
```

也可以把 `all` 替换为 `test`、`lint`、`typecheck`、`build`、`demo` 或 `audit`，只运行单项门禁。

`pnpm demo` 是完全离线的三个自动断言：

1. 危险删除命令或敏感文件动作被治理层拒绝，所有工具 handler 的调用数为零。
2. 第一次允许的验证命令失败后，失败摘要回灌给 mock LLM；它选择修正动作并以 `finish` 完成。
3. 两次连续业务失败后立即以既定原因停止，不请求第三次 Provider，也不发生第三次工具调用。

## CLI：普通使用

进入希望 Agent 操作的项目目录，直接运行：

```powershell
ai4se-harness
```

当前目录会自动成为工作区。首次启动只会依次要求直接填写以下三项：

1. 服务地址；
2. API Key（隐藏输入）；
3. 模型名称。

初始化成功后，程序自动写入不含秘密的 `.ai4se/config.json`，并使用 Windows 当前用户范围的系统保护保存 API Key。后续在同一目录再次运行 `ai4se-harness` 会直接进入会话，不再询问主密码或重复询问 API Key。API Key 不会写入普通配置、命令参数、输出或 Trace。

服务地址必须是 HTTPS 地址，或指向本机回环地址的 HTTP 地址；地址不得包含用户名、密码、查询参数或片段。API Key 和模型名称必须是无首尾空白的非空值。当前版本只执行这些严格本地校验，**不声称已完成 Provider 网络联通性或鉴权验证**；真实 Provider 会在首次任务请求时返回网络或鉴权结果。

普通无参数流程在非 Windows 平台会安全拒绝，不会退回明文凭据。`credentials`、`start --config` 和一次性 `--task` 仍作为旧式高级维护入口保留。

## CLI：高级兼容入口

以下流程只用于维护和验证旧式配置、主密码凭据及显式命令，不是普通用户的启动方式。

### 1. 打包、安装与离线检查

在仓库根目录运行：

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 pack
$tarball = (Get-ChildItem .\.ai4se\submission-output\ai4se-harness-*.tgz | Select-Object -First 1).FullName
pnpm add --global $tarball
ai4se-harness smoke
```

预期输出：

```text
AI4SE Harness 离线 smoke：completed
```

`smoke` 完全离线，不读取配置或 API Key。如果 pnpm 报 `ERR_PNPM_NO_GLOBAL_BIN_DIR`，先运行 `pnpm setup`，关闭并重新打开终端，再重新安装；不要因此把 Key 写入命令行。

### 2. 准备真实 Provider 测试

进入希望 Agent 操作的项目目录。这个目录会自动成为工作区：

```powershell
cd D:\path\to\your-project
New-Item -ItemType Directory -Force .ai4se | Out-Null
```

创建 `.ai4se/config.json`，只替换 `baseUrl` 和 `model`；`workspace` 是过渡兼容字段，当前开发版不会用它切换工作区。配置中严禁填写 API Key：

```json
{
  "workspace": ".",
  "allowedCommands": [],
  "maxSteps": 8,
  "commandTimeoutMs": 60000,
  "maxOutputBytes": 32768,
  "memoryPath": ".ai4se/memory.json",
  "provider": {
    "baseUrl": "https://your-provider.example/v1",
    "model": "your-model-name"
  }
}
```

旧式兼容入口需要初始化主密码加密凭据：

```powershell
ai4se-harness credentials init
```

程序会隐藏询问主密码和 API Key。主密码至少 12 个字符；API Key 和主密码都不要写入命令参数、配置、日志或 Git。普通无参数流程不使用这一凭据文件，也不会询问主密码。

### 3. 启动并验证真实 Agent

保持终端位于刚才的项目目录，直接运行：

```powershell
ai4se-harness
```

启动后应显示当前工作区和模型。建议依次测试：

```text
/status
请先使用 read_file 读取 README.md，然后用 finish 总结项目名称和用途。不要写文件，不要运行命令。
请引用上一题的项目名称，并说明你刚才使用了什么信息。
/model
/model 新模型名称
/memory
/new
/memory clear
/trace
/exit
```

验收结果应满足：

1. `/status` 显示的工作区等于启动命令所在目录。
2. Agent 能调用读取工具并以 `completed` 结束，Trace 不包含 API Key。
3. 无参数 `ai4se-harness` 进入会话；只有显式 `ai4se-harness smoke` 才运行离线检查。
4. 同一会话的第二个问题能引用第一题及其回答；`/new` 后短期历史为空。
5. `/model` 能查看当前模型，填写新名称后保存并用于后续请求。
6. `/memory` 只显示安全摘要；`/memory clear` 经确认后清空长期 Memory；`/new` 会先固化候选但只重置短期历史。
7. 退出并重新启动后，相关新任务能检索上次会话的完成摘要，无关任务不会注入该摘要。
8. 普通任务输出不展开 Action JSON、底层工具名或内部错误码；需要诊断时显式使用 `/trace`。

兼容入口 `ai4se-harness start --config .ai4se/config.json` 和一次性 `--task` 仍然保留，但不属于最终普通用户流程。

## 本地 Web：一次运行的临时 Key

本地模式会一起启动仅监听回环地址的 API 和 Vite 开发服务器：

```powershell
pnpm web:local
```

默认页面地址为 [http://127.0.0.1:5173](http://127.0.0.1:5173)，本地 API 为 `http://127.0.0.1:4174`，且 API 只监听 `127.0.0.1`。可在启动前设置 `AI4SE_LOCAL_API_PORT` 为 `1` 到 `65535` 的整数；Vite 仍固定在 `127.0.0.1:5173` 并严格占用该端口。

本地表单一次提交任务、Provider Base URL、模型和 Key 到相对 `/api/runs`。Key 使用 password 输入框，只用于这一次请求：前端无论成功或失败都会清空它，后端不落盘、不回显、不记录，也不重试。页面不会使用浏览器持久化存储。该模式默认没有人工审批，因此 `ask` 写入动作会被阻断；需要持久化加密凭据或逐项审批时，请改用 CLI。

## 托管交付：GitLab Release

课程检查入口：[v1.1.0 Release](https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.1.0)。学校 GitLab 当前没有为本项目提供可用的公开 Pages 地址，因此依据助教补充说明，本项目采用“CLI + 托管平台 Release”方式交付，不迁移到 GitHub。

从 Release 下载 `ai4se-harness-0.2.0.tgz` 后，在 Node.js 24 与 pnpm 11.14.0 环境中安装并验证：

```powershell
pnpm add --global .\ai4se-harness-0.2.0.tgz
ai4se-harness smoke
ai4se-harness credentials init
ai4se-harness start --config .ai4se/config.json
```

`smoke` 成功时输出 `AI4SE Harness 离线 smoke：completed`。`start` 会打开持续运行的 `ai4se>` 终端会话。WebUI 仍可通过仓库统一入口在本地运行；`apps/web` 的静态页面只用于脱敏架构演示，不接收 API Key，也不连接线上后端。

## npm tarball 分发 smoke

`@ai4se/harness` 0.2.0 是可安装的 ESM 包，提供类型入口、共享任务运行器、会话运行器、`runOfflineSmoke` 和 `ai4se-harness` CLI。以下 PowerShell 命令会构建 tarball，在新目录离线安装，然后分别验证 ESM 导入和已安装 CLI：

```powershell
pnpm --filter @ai4se/harness build
$tarballDir = Join-Path $PWD ("tarballs-" + [guid]::NewGuid())
New-Item -ItemType Directory $tarballDir | Out-Null
pnpm --filter @ai4se/harness pack --pack-destination $tarballDir
$tarball = (Get-ChildItem $tarballDir -Filter "*.tgz" | Select-Object -First 1).FullName

$installDir = Join-Path $PWD ("tarball-smoke-" + [guid]::NewGuid())
New-Item -ItemType Directory $installDir | Out-Null
Set-Location $installDir
@'
{
  "name": "ai4se-tarball-smoke",
  "private": true,
  "type": "module"
}
'@ | Set-Content -Encoding utf8 package.json
pnpm add --offline $tarball
@'
import { runOfflineSmoke } from "@ai4se/harness";

console.log(await runOfflineSmoke());
'@ | Set-Content -Encoding utf8 verify-import.mjs
node verify-import.mjs
pnpm exec ai4se-harness
pnpm exec ai4se-harness --help
```

两个 smoke 都应输出 `AI4SE Harness 离线 smoke：completed`。tarball 是课程交付产物，不表示它已发布到公共 npm registry；`@ai4se/harness` 当前标记为 `UNLICENSED`，不得假定获得再分发权利。

## 目录结构

```text
apps/api/            本地 CLI、配置预检、仅回环 Fastify API
apps/web/            静态 mock 与显式本地 Web 模式
packages/harness/    Harness 内核及可安装的 ESM tarball 包
tests/               单元、集成、机制演示与分发 smoke
scripts/             本地 Web 启动器
```

## 安全与分发边界

- API Key 不应进入配置、命令行参数、源码、Git、日志、Trace、Memory、URL 或浏览器持久化存储。
- `AGENTS.md` / `CLAUDE.md` 只作为带来源和作用域的工作区规则注入，不能覆盖路径围栏、Policy、Approval 或凭据隔离。
- 上下文摘要会脱敏并省略写入正文、命令参数和大段工具输出；字符预算默认 24,000，可在内部配置中设置 `contextBudgetChars`。
- 长期 Memory 只接受显式“记住约定：…”约定和已完成任务的简短摘要；候选会拒绝凭据与个人标识、限制为 320 字符、稳定提取标签并按确定性 ID 去重。
- 路径逃逸、敏感路径、Shell 启动器、删除类命令和白名单外命令由策略拒绝；写入需要当前 CLI 会话批准。
- Skill 拒绝路径逃逸、符号链接文件、工作区外真实路径、无效元数据、损坏 UTF-8 和超大文件；发现阶段只读取限长头部名片，命中后才读取正文，且 Skill 不能覆盖系统安全约束。
- MCP 是外部信任边界：本项目只内置自研适配接口和离线 mock，调用仍须经过 Policy/Approval 与 Pre/Post Hooks；本地文件和命令沙箱不保护远端实现。
- 生命周期只包含 `SessionStart`、`PreToolUse`、`PostToolUse`、`SessionEnd`；Hook 可阻断但不替代 Policy 或 Approval，结果和错误统一脱敏后写入独立 Hook Trace。
- 子 Agent 只串行运行，使用独立 `SessionContext`、父级允许的最小工具集、最大深度、单子步骤上限和父子共享总预算；只把脱敏限长摘要写回父会话。
- Sensor 只接受结构化 `executable`/`args` 并复用 `CommandTool` 的白名单、无 Shell、超时和输出上限；只在成功写入后运行，不在读取、Skill、MCP 或 finish 后无条件触发。
- Checkpoint 只保存明确写入目标的受限 UTF-8 单文件状态；拒绝目录、符号链接、敏感路径、敏感正文和超限文件。恢复逐个覆盖原文件，或只删除本次创建的那个已确认普通文件。
- 本地 API 限制为回环监听并校验本地 Web Origin；它不是线上后端。
- 静态 mock 与本地 Web 是不同入口：静态内容不连接 API，本地 Web 才能连接本机回环服务。
- tarball 仅承诺 Node 24 与本 README 明确的平台范围；它通过 GitLab Release 分发，不是公共 npm registry 发布声明。

## 已知限制

- 仅支持一个 OpenAI-compatible Provider 接口；不提供多 Provider、凭据轮换或线上服务。
- MCP 只支持教学级适配边界和 mock，不实现生产级协议、认证、远端连接、市场或动态安装。
- Skill 只从当前工作区约定目录加载；不提供远程 Skill 市场。子 Agent 不并行运行，也不使用 Git worktree、网络沙箱或生产级调度器。
- Checkpoint 不回滚未声明写集的命令、MCP、网络或系统副作用；这类动作只记录 `external_side_effect_not_snapshot_capable` 限制，绝不声称已恢复。
- 不提供数据库、向量检索、Docker、SSE、多用户、RBAC、团队协作或浏览器端到端测试。
- 自动修正只允许一次，默认最多运行 8 步；复杂或高风险任务应由人工拆分与审核。
- 长期 Memory 使用关键词和标签的轻量确定性检索，不提供向量数据库、语义嵌入或跨工作区共享。
- 旧式兼容凭据依赖主密码质量；普通流程使用 Windows 当前用户保护。两者都无法消除进程内存中的短暂明文暴露风险。

## 第三方许可证

直接依赖的锁定版本、已安装包元数据中的许可证以及用途见 [LICENSES.md](LICENSES.md)。该文件是归档说明，不复制第三方许可证全文，也不改变任何依赖的原始许可条件。
