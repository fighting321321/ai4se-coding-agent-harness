# 项目执行规则

## 统一运行环境

- 在 Windows/Codex 环境中执行本项目命令时，必须使用 `powershell -NoProfile -File .\scripts\project-env.ps1 <task>`。
- 可用任务为 `versions`、`install`、`test`、`lint`、`typecheck`、`build`、`demo`、`audit` 和 `all`。
- 不得直接使用系统默认 `node`、`pnpm`，也不得绕过 pnpm 直接启动 Vitest；统一入口负责固定 Node 24.14.0、pnpm 11.14.0 与 `npm_execpath`。
- 如果 Vite、Vitest 或 Git 子进程在沙箱内出现 `spawn EPERM`，应在获准环境中原样重跑同一个统一入口，不得临时改用另一套启动命令。

## 当前开发状态

- T01–T12 单项任务均已结束，`guiding.md` 在 `dev` 中保持为空。
- 后续修复和最终交付收尾直接在 `dev` 分支提交，不再创建新的 Txx 分支；除非用户另有明确要求。
- 不得把真实 API Key、密码、token 或其他凭据写入聊天、命令参数、源码、日志、测试输出或 Git。
