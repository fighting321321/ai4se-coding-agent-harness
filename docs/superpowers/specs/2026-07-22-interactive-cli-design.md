# AI4SE 会话式 CLI 设计

## 1. 目标

把当前“一次启动、一次任务、一次主密码”的验收型 CLI 改造成可分发的终端会话产品。用户运行 `ai4se-harness start` 后只解锁一次本地加密凭据，随后在同一进程中连续提交任务，直到主动退出。

本次保持课程项目的最小范围：实现普通终端 REPL，不实现 OpenCode 式全屏 TUI、鼠标交互、窗口布局、流式 Markdown 或会话云同步。

## 2. 用户入口

全局安装 Release tarball 后支持：

```powershell
ai4se-harness smoke
ai4se-harness credentials status
ai4se-harness credentials init
ai4se-harness credentials update
ai4se-harness credentials clear
ai4se-harness start --config .ai4se/config.json
```

`start` 的交互示例：

```text
主密码：
AI4SE Coding Agent
Workspace: D:\project
Model: qwen-turbo
输入 /help 查看命令。

ai4se> 读取 README 并总结
[1] read_file README.md · allow · running
[2] finish · allow · completed

Coding Agent Harness 是一个可治理的教学型编码智能体。

ai4se> /exit
会话已结束
```

内置命令限定为：

- `/help`：显示可用命令与安全提示；
- `/status`：显示 workspace、model 和配置路径，不显示凭据；
- `/trace`：显示当前会话最近一次任务的脱敏 Trace；
- `/clear`：清空终端显示，不删除 Memory、Trace、配置或凭据；
- `/exit`：结束进程并释放对解密 Key 的引用；空输入不调用 Provider。

## 3. 运行与安全模型

1. 启动时读取并校验配置，再隐藏读取一次主密码。
2. 使用现有 `CredentialStore` 解密 API Key；失败则在进入 REPL 前退出。
3. Key 只保存在当前 Node 进程内存中，不写入配置、日志、Trace、Memory、命令参数或终端输出。
4. 每条普通输入作为独立 Harness task 运行，共用配置、Memory 和追加式 Trace。
5. `read_file` 与白名单命令沿用 Policy；每一个 `write_file` 的 `ask` 决策都单独询问，不缓存上一次批准。
6. 每次任务输出最终状态、summary 和本次 Trace；Provider、配置或工具错误使用稳定中文信息，不输出远端响应正文。
7. `Ctrl+C` 在等待任务输入时结束会话；在隐藏输入或审批时取消当前操作。退出只能降低内存驻留时间，不能承诺 JavaScript 运行时立即物理擦除字符串。

## 4. 代码边界

- `packages/harness/src/run-task.ts`：承载可复用的配置预检和完整 Harness 装配；由 API、一次性 CLI 和会话式 CLI 共用。
- `packages/harness/src/interactive-session.ts`：实现与终端无关、可注入输入输出的 REPL 状态机。
- `packages/harness/bin/ai4se-harness.mjs`：处理真实 TTY、隐藏输入、审批、信号和子命令分发。
- `apps/api/src/run-task.ts`：缩减为共享 runner 的兼容导出，避免 Web 与 CLI 复制装配逻辑。
- 现有 `apps/api` 一次性 CLI 保留兼容，不强迫已有脚本迁移。

不新增运行时依赖；使用 Node 24 自带的 `readline`、TTY 和现有 Harness 模块。

## 5. 分发

`@ai4se/harness` 从仅含离线 smoke 的内核包升级为可直接使用的 Agent CLI：

- 包版本提升至 `0.2.0`；
- `bin` 仍为 `ai4se-harness`，旧 `smoke` 命令兼容；
- tarball 必须包含交互 runner、凭据管理、配置、工具、策略与 AgentLoop；
- 在全新临时目录安装 tarball 后，`smoke`、`--help`、凭据状态和 REPL 合约均可验证；
- 最终托管版本使用 GitLab Release `v1.1.0`，不覆盖现有 `v1.0.0` 历史证据。

## 6. 验收标准

1. 未配置凭据时 `start` 给出稳定错误且不进入会话。
2. 已配置时只询问一次主密码，连续两个任务不会再次询问。
3. 真实或脚本 Provider 能完成 `read_file → Observation → finish`，终端显示 summary 与两步 Trace。
4. 两个写入动作分别询问批准；拒绝后不得调用文件 handler。
5. `/status`、`/trace`、`/clear`、`/help`、`/exit` 不调用 Provider。
6. Key 不出现在输出、错误、Trace、Memory、构建产物与 Git 历史中。
7. Node `24.14.0`、pnpm `11.14.0` 下完整 test、lint、typecheck、build、demo、audit 全部通过。
8. README、提交说明、源码 ZIP、CLI tarball、SHA-256 和 Release 使用方式保持一致。

## 7. 非目标

- 不实现全屏 TUI、聊天气泡、语法高亮或流式 token；
- 不实现免密长期会话、系统钥匙串、后台守护进程或浏览器认证；
- 不扩大 Action 类型、Provider 数量或命令白名单能力；
- 不改变 WebUI 的一次性临时 Key 模型。
