# Coding Agent Harness

> **开发状态（dev 重新评估）：** `v1.1.0` 是安全工具循环与分发基线，不是《Agent 的一生》所描述的最终 Harness。它不能让后一项终端任务读取前一项任务的对话内容，`JsonMemory` 也尚未接入主循环的写入与固化。项目负责人已批准路线 B（教学级完整 Harness）及面向用户的 CLI 方向：最终首次向导只填写服务地址、隐藏 API Key 和模型名称，不再设置本地保护密码；当前目录自动成为工作区。完整差距、CLI 决策、提交上限和成本估计见 [`FULL_HARNESS_REASSESSMENT.md`](FULL_HARNESS_REASSESSMENT.md)。当前版本仍不应作为完整 Harness 最终提交。

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

真实本地运行的数据流为：CLI 从本地配置读取限制并从加密凭据存储读取 Key，或本地 Web 为一次运行临时提交 Key；Harness 尝试从现有 Memory 文件检索相关条目，调用一次 OpenAI-compatible Provider，严格解析 Action，再经策略、审批与工具执行；反馈摘要、脱敏 Trace 和停机原因决定下一轮或结束。当前主循环不会自动写入或固化 Memory，终端中的不同任务也不共享对话历史。

Harness 的六个维度及其对应实现是：

| 维度 | 主要职责 |
| --- | --- |
| 决策封装 | `AgentLoop` 组织任务、相关记忆和 Observation，并调用单次 Provider 补全。 |
| 工具 | 受限文件读写与命令执行；命令使用可执行文件和参数数组，不拼接 Shell 字符串。 |
| 记忆 | 已有本地 JSON 存储与关键词检索类，但尚未接入主循环写入、固化和跨任务上下文；完整实现仍待开发。 |
| 治理 | `PolicyEngine` 对动作给出 `allow`、`ask` 或 `deny`，审批在副作用前发生。 |
| 反馈 | 验证结果分类为可供下一轮使用的简短 Observation。 |
| 配置 | JSON 配置校验工作区、白名单、步数、超时、输出上限、Memory 和 Provider；其中不允许 API Key。 |

项目的主要贡献是反馈闭环：第一次业务失败的脱敏 Observation 会回灌给下一次决策；最多允许一次自动修正，第二次连续业务失败立即停止。因此「失败类型、失败证据、修正次数和停机条件」都由代码强制，而不是由提示词约定。

## 作业交付清单

- 设计与计划：[`SPEC.md`](SPEC.md)、[`PLAN.md`](PLAN.md)、[`SPEC_PROCESS.md`](SPEC_PROCESS.md)。
- 过程与反思：[`AGENT_LOG.md`](AGENT_LOG.md)、[`COLD_START_VALIDATION.md`](COLD_START_VALIDATION.md)、[`REFLECTION.md`](REFLECTION.md)。
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

## CLI：测试当前开发版

当前 `dev` 已支持“无参数启动”和“当前目录即工作区”，但首次三项向导与 Windows 系统凭据存储尚未实现。下面是这一过渡版本的完整可执行测试流程；后续向导完成后，第 2 步和 `credentials init` 将由程序内部自动完成。

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

当前过渡版本还需要初始化旧式加密凭据：

```powershell
ai4se-harness credentials init
```

程序会隐藏询问主密码和 API Key。主密码至少 12 个字符；API Key 和主密码都不要写入命令参数、配置、日志或 Git。最终路线 B 会取消这一步中的主密码，并改为首次启动时只填写服务地址、隐藏 API Key 和模型名称。

### 3. 启动并验证真实 Agent

保持终端位于刚才的项目目录，直接运行：

```powershell
ai4se-harness
```

启动后应显示当前工作区和模型。建议依次测试：

```text
/status
请先使用 read_file 读取 README.md，然后用 finish 总结项目名称和用途。不要写文件，不要运行命令。
/trace
/exit
```

验收结果应满足：

1. `/status` 显示的工作区等于启动命令所在目录。
2. Agent 能调用读取工具并以 `completed` 结束，Trace 不包含 API Key。
3. 无参数 `ai4se-harness` 进入会话；只有显式 `ai4se-harness smoke` 才运行离线检查。
4. 当前版本在一次启动中只询问一次主密码，但不同任务仍不共享完整对话历史；这是路线 B 后续提交要修复的已知缺口。

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
- 路径逃逸、敏感路径、Shell 启动器、删除类命令和白名单外命令由策略拒绝；写入需要当前 CLI 会话批准。
- 本地 API 限制为回环监听并校验本地 Web Origin；它不是线上后端。
- 静态 mock 与本地 Web 是不同入口：静态内容不连接 API，本地 Web 才能连接本机回环服务。
- tarball 仅承诺 Node 24 与本 README 明确的平台范围；它通过 GitLab Release 分发，不是公共 npm registry 发布声明。

## 已知限制

- 仅支持一个 OpenAI-compatible Provider 接口；不提供多 Provider、凭据轮换或线上服务。
- 不提供数据库、向量检索、Docker、SSE、多用户、RBAC、团队协作或浏览器端到端测试。
- 自动修正只允许一次，默认最多运行 8 步；复杂或高风险任务应由人工拆分与审核。
- 加密凭据依赖主密码质量，且无法消除进程内存中的短暂明文暴露风险。

## 第三方许可证

直接依赖的锁定版本、已安装包元数据中的许可证以及用途见 [LICENSES.md](LICENSES.md)。该文件是归档说明，不复制第三方许可证全文，也不改变任何依赖的原始许可条件。
