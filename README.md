# Coding Agent Harness

一个面向课程学习的、可确定性验证的 Coding Agent Harness。它把一次可替换的 LLM 补全放进由 TypeScript 代码实现的工具边界、策略、记忆、反馈和 Trace 中；不是现成 Agent Runner，也不是线上多用户平台。

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
  Pages：静态 mock
  本地模式：一次运行请求
```

真实本地运行的数据流为：CLI 从本地配置读取限制并从加密凭据存储读取 Key，或本地 Web 为一次运行临时提交 Key；Harness 检索相关 Memory，调用一次 OpenAI-compatible Provider，严格解析 Action，再经策略、审批与工具执行；反馈摘要、脱敏 Trace 和停机原因决定下一轮或结束。

Harness 的六个维度及其对应实现是：

| 维度 | 主要职责 |
| --- | --- |
| 决策封装 | `AgentLoop` 组织任务、相关记忆和 Observation，并调用单次 Provider 补全。 |
| 工具 | 受限文件读写与命令执行；命令使用可执行文件和参数数组，不拼接 Shell 字符串。 |
| 记忆 | 本地 JSON Memory 只按关键词注入相关约定或最近结果。 |
| 治理 | `PolicyEngine` 对动作给出 `allow`、`ask` 或 `deny`，审批在副作用前发生。 |
| 反馈 | 验证结果分类为可供下一轮使用的简短 Observation。 |
| 配置 | JSON 配置校验工作区、白名单、步数、超时、输出上限、Memory 和 Provider；其中不允许 API Key。 |

项目的主要贡献是反馈闭环：第一次业务失败的脱敏 Observation 会回灌给下一次决策；最多允许一次自动修正，第二次连续业务失败立即停止。因此「失败类型、失败证据、修正次数和停机条件」都由代码强制，而不是由提示词约定。

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

## CLI：凭据与真实任务

先构建，再直接调用本地 CLI 入口：

```powershell
pnpm build
node apps/api/dist/cli-entry.js credentials init
node apps/api/dist/cli-entry.js credentials status
node apps/api/dist/cli-entry.js credentials update
node apps/api/dist/cli-entry.js credentials clear
```

`init` 和 `update` 依次以隐藏输入读取主密码和 API Key；`clear` 以隐藏输入读取主密码；`status` 只输出 `configured` 或 `unconfigured`，不读取或显示秘密。主密码去除首尾空白后必须至少 12 个字符。请使用可恢复的密码管理方式保存主密码：遗忘后无法恢复已加密的 Key。

凭据文件位于当前工作目录的 `.ai4se/credentials.json`，以 scrypt 派生密钥和 AES-256-GCM 加密存储。不要把 Key、主密码或等价秘密放进命令行参数：CLI 会拒绝 `--api-key`、`--password`、`--master-password`、`--secret` 和 `--token`。加密不改变运行时内存风险，主密码和 Key 在处理期间仍可能短暂以明文存在于进程内存中。

真实任务还需要一个不含秘密的 `.ai4se/config.json`。下面是可复制的最小结构；将 Provider 地址、模型、工作区与白名单替换为你的本地环境，但不要加入 API Key：

```json
{
  "workspace": ".",
  "allowedCommands": [
    { "executable": "pnpm", "args": ["test"] }
  ],
  "maxSteps": 8,
  "commandTimeoutMs": 60000,
  "maxOutputBytes": 32768,
  "memoryPath": ".ai4se/memory.json",
  "provider": {
    "baseUrl": "https://your-provider.example/v1",
    "model": "your-model"
  }
}
```

随后在 TTY 中运行任务。写文件动作会显示动作类型与目标，并要求当前会话人工批准；没有批准时不会调用工具。

```powershell
node apps/api/dist/cli-entry.js --task "为当前工作区运行允许的检查" --config ".ai4se/config.json"
```

配置中的 `workspace`、命令白名单、最大步数、超时、输出上限和 Memory 路径由本地文件控制；任务请求不能覆盖这些边界。

## 本地 Web：一次运行的临时 Key

本地模式会一起启动仅监听回环地址的 API 和 Vite 开发服务器：

```powershell
pnpm web:local
```

默认页面地址为 [http://127.0.0.1:5173](http://127.0.0.1:5173)，本地 API 为 `http://127.0.0.1:4174`，且 API 只监听 `127.0.0.1`。可在启动前设置 `AI4SE_LOCAL_API_PORT` 为 `1` 到 `65535` 的整数；Vite 仍固定在 `127.0.0.1:5173` 并严格占用该端口。

本地表单一次提交任务、Provider Base URL、模型和 Key 到相对 `/api/runs`。Key 使用 password 输入框，只用于这一次请求：前端无论成功或失败都会清空它，后端不落盘、不回显、不记录，也不重试。页面不会使用浏览器持久化存储。该模式默认没有人工审批，因此 `ask` 写入动作会被阻断；需要持久化加密凭据或逐项审批时，请改用 CLI。

## GitLab Pages：只读静态 mock

GitLab Pages 构建仅发布 `apps/web` 的静态页面，用固定、脱敏的 mock 轨迹解释架构、治理阻断、失败修正和 Memory 摘要。它不接收 Key、不包含真实运行表单、不连接本地 API，也不运行真实 Agent。

真实 Pages URL：**待最终审计核验**。在核验完成前，请不要把任何猜测的项目地址当作可用服务链接。

## npm tarball 分发 smoke

`@ai4se/harness` 是可安装的 ESM 包，提供类型入口、`runOfflineSmoke` 导入和 `ai4se-harness` CLI。以下 PowerShell 命令会构建 tarball，在新目录离线安装，然后分别验证 ESM 导入和已安装 CLI：

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
```

两个 smoke 都应输出 `AI4SE Harness 离线 smoke：completed`。tarball 是课程交付产物，不表示它已发布到公共 npm registry；`@ai4se/harness` 当前标记为 `UNLICENSED`，不得假定获得再分发权利。

## 目录结构

```text
apps/api/            本地 CLI、配置预检、仅回环 Fastify API
apps/web/            Pages 静态 mock 与显式本地 Web 模式
packages/harness/    Harness 内核及可安装的 ESM tarball 包
tests/               单元、集成、机制演示与分发 smoke
scripts/             本地 Web 启动器
```

## 安全与分发边界

- API Key 不应进入配置、命令行参数、源码、Git、日志、Trace、Memory、URL 或浏览器持久化存储。
- 路径逃逸、敏感路径、Shell 启动器、删除类命令和白名单外命令由策略拒绝；写入需要当前 CLI 会话批准。
- 本地 API 限制为回环监听并校验本地 Web Origin；它不是线上后端。
- Pages 与本地 Web 是不同模式：Pages 只有静态 mock，本地 Web 才能连接本机 API。
- tarball 仅承诺 Node 24 与本 README 明确的平台范围；它不是公共 registry 的发布声明。

## 已知限制

- 仅支持一个 OpenAI-compatible Provider 接口；不提供多 Provider、凭据轮换或线上服务。
- 不提供数据库、向量检索、Docker、SSE、多用户、RBAC、团队协作或浏览器端到端测试。
- 自动修正只允许一次，默认最多运行 8 步；复杂或高风险任务应由人工拆分与审核。
- 加密凭据依赖主密码质量，且无法消除进程内存中的短暂明文暴露风险。

## 第三方许可证

直接依赖的锁定版本、已安装包元数据中的许可证以及用途见 [LICENSES.md](LICENSES.md)。该文件是归档说明，不复制第三方许可证全文，也不改变任何依赖的原始许可条件。
