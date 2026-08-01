# 项目执行规则

## 统一运行环境

- 在 Windows/Codex 环境中执行本项目命令时，必须使用 `powershell -NoProfile -File .\scripts\project-env.ps1 <task>`。
- 可用任务为 `versions`、`install`、`test`、`lint`、`typecheck`、`build`、`demo`、`audit`、`pack` 和 `all`。
- 不得直接使用系统默认 `node`、`pnpm`，也不得绕过 pnpm 直接启动 Vitest；统一入口负责固定 Node 24.14.0、pnpm 11.14.0 与 `npm_execpath`。
- 如果 Vite、Vitest 或 Git 子进程在沙箱内出现 `spawn EPERM`，应在获准环境中原样重跑同一个统一入口，不得临时改用另一套启动命令。

## 当前开发状态

- T01–T17 单项任务均已结束；T17 已由 `release/t17-harness-v2` 合入 `dev`，真实 Provider 只读验收已经通过。
- 后续只允许在 `dev` 完成提交材料与 `v2.0.0` Release 收尾，再合并 `main`、打标签并公开发布；不得继续扩张功能范围。
- 学校 GitLab 未提供可用的公开 Pages 地址；最终托管交付采用助教允许的“CLI + GitLab `v2.0.0` Release”，WebUI 仅保留本地模式与静态 mock 源码。
- 不得把真实 API Key、密码、token 或其他凭据写入聊天、命令参数、源码、日志、测试输出或 Git。
