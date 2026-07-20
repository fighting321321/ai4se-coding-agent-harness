# T11 双模式 WebUI、本地 API 与 GitLab Pages：七提交计划

> 当前分支：`feat/t11-static-web`
>
> 基线：`dev` 提交 `469fe5a`；基线测试 20/20 文件、218/218 用例通过。
>
> 总计 7 个提交，不超过 7 个。公开 Pages 保持纯静态；真实运行只在本机显式启动，不部署线上后端。

## 已确认边界

- Node 24、pnpm 11.14.0、TypeScript strict、React 19、Vite 8、Fastify 5；不新增运行时依赖。
- Pages 构建不含表单、API 请求、localhost 地址或 Key 文案，只消费 fake `demo-data.ts`。
- 本地构建才显示任务、endpoint、model 和 password 类型 Key 输入；Key 不进入浏览器存储、URL、日志、Trace、Memory、普通配置或 Git。
- Fastify 只监听 `127.0.0.1`，校验本地 Vite Origin，限制 JSON 请求体；远端 Provider 必须 HTTPS，回环 Provider 可 HTTP。
- 本地请求只能覆盖 Provider 和任务；工作区、命令白名单、超时、输出上限、Memory 路径和最大步数来自 `.ai4se/config.json`。
- Web 不实现交互式批准；Policy `ask` 默认拒绝并提示使用 CLI。无 SSE/WebSocket、取消、历史、多用户或线上后端。
- Pages URL、Pipeline 状态和真实学校 API smoke 只记录实际证据；无法确认时如实留到最终审计。

## 提交序列

### 提交 1：原静态规划

**提交：** `202a3f9 docs: 规划T11静态页面与Pages步骤`

- [x] 建立 T11 初始静态页面计划。

### 提交 2：双模式设计

**提交：** `05e86a9 docs: 记录T11双模式Web设计`

- [x] 比较浏览器直连、双模式与纯 CLI 三种方案。
- [x] 用户批准“公开静态演示 + 本地真实运行模式”。
- [x] 固定凭据生命周期、回环边界、数据流、错误与测试策略。

### 提交 3：更新规格与实施计划

**提交信息：** `docs: 调整T11双模式实施计划`

- [x] 更新 `SPEC.md`、`PLAN.md` 与本文件，消除旧“Web 永不连接 API”约束。
- [x] 写入 `docs/superpowers/plans/2026-07-20-t11-dual-mode-web.md`。
- [x] 自审无占位、接口名一致、需求均有任务覆盖。

### 提交 4：本地 API RED → GREEN

**提交信息：** `feat: 增加T11本地运行API`

- [ ] RED：本地运行服务、route 校验、Origin、零泄露、默认拒绝批准与 CLI 回归测试。
- [ ] GREEN：抽出共享 Harness 组装，新增 Fastify factory 与仅回环 server entry，CLI 复用共享 runner。
- [ ] 聚焦 API/CLI 测试、typecheck、lint、build 全部通过。

### 提交 5：双模式 Web RED → GREEN

**提交信息：** `feat: 实现T11双模式Web页面`

- [ ] RED：静态页面契约、本地表单边界、请求状态清理和静态 artifact 零本地入口测试。
- [ ] GREEN：实现 mock 数据、语义化单页、本地表单/client、响应式样式和编译期模式开关。
- [ ] 聚焦 Web 测试、typecheck、lint、静态/local build 全部通过。

### 提交 6：本地启动、Pages 与审查记录

**提交信息：** `ci: 发布T11静态页面并记录审查`

- [ ] 新增单命令本地启动编排；新增 `pages` stage/job 且保留精确 `unit-test`。
- [ ] Pages 只发布 `apps/web/dist`；CI 不使用真实 Key，不启动真实远端 API。
- [ ] 完成逐任务审查、全分支审查和完整门禁，更新 `PLAN.md`、`AGENT_LOG.md`。

### 提交 7：清空任务规划

**提交信息：** `docs: 清空T11任务规划`

- [ ] 确认提交 1–6 完成、门禁通过、分支恰好不超过 7 个提交、工作区无无关改动。
- [ ] 只清空 `guiding.md` 并提交。
- [ ] 不由 AI 推送或创建 MR；把远程操作与真实 API smoke 交给项目负责人。

## 完整门禁

```powershell
pnpm test
pnpm demo
pnpm lint
pnpm typecheck
pnpm build
git diff --check
git status --short
```
