# T05 工程骨架：精简提交计划

> 当前分支：`chore/t05-project-foundation`
>
> 定位：暑期课大作业轻量模式。每个一级步骤对应一个提交，只保留能运行、能测试、能说明的核心证据；不做生产级重复评审。

## 开始条件

- T04 已通过 G3，并以合并提交 `0b03b78` 进入最新 `dev`。
- 本分支从该 `dev` 创建，只承载 T05，不与其他 Txx 共用。
- `OPEN-03` 尚未批准：提交 1 只做规划；安装依赖或创建工程骨架前，先在 T05 对话中列出当前稳定版本候选，由项目负责人明确回复“批准”。
- T05 只建立 workspace、构建/测试入口和健康检查，不实现 Decision、Runtime、Policy、工具或数据库行为。

## 提交 1：规划工程骨架

**提交信息：** `docs: 规划T05工程骨架步骤`

**修改：** `guiding.md`

- [x] 记录 G3、分支基线、文件范围和精简提交顺序。
- [x] 查询并列出 Node.js LTS、pnpm、TypeScript、Fastify、React、Vite、Vitest 的当前稳定候选版本。
- [x] 将候选版本交由项目负责人一次性批准；未批准前停止，不运行安装命令。

**验证：**

```powershell
git diff --check
git diff --name-only
```

预期：只有 `guiding.md` 改动。

---

## 提交 2：建立并锁定项目工程骨架

**提交信息：** `chore: 建立项目工程骨架`

**创建：**

- 根配置：`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`tsconfig.base.json`、`eslint.config.js`、`vitest.workspace.ts`
- API：`apps/api/package.json`、`apps/api/tsconfig.json`
- Web：`apps/web/package.json`、`apps/web/tsconfig.json`、`apps/web/index.html`、`apps/web/vite.config.ts`、`apps/web/src/main.tsx`
- 共享包：`packages/domain/package.json`、`packages/domain/src/index.ts`、`packages/shared/package.json`、`packages/shared/src/index.ts`
- 测试支持：`tests/test-support/fixed-values.ts`

**修改：** `.gitignore`、`guiding.md`

- [x] 将获批版本写入根 `package.json`，配置 `test`、`lint`、`typecheck`、`build` 四个根命令。
- [x] 建立严格 TypeScript、ESM、Vitest、React/Vite 最小配置和空包导出。
- [x] 生成锁文件并确认 `pnpm install --frozen-lockfile` 成功且不会改锁文件。
- [x] 确认 `.env`、`node_modules`、构建目录和本地数据库均被忽略。

**验证：**

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
git status --short
```

预期：安装可复现，静态检查和空骨架构建成功，无业务机制或不应跟踪的产物。

---

## 提交 3：加入最小健康测试

**提交信息：** `test: 建立最小健康测试`

**创建：** `apps/api/src/health.ts`、`tests/unit/foundation/health.test.ts`

- [x] 先写测试，断言 `healthStatus()` 精确返回 `{ status: "ok" }`，并确认实现缺失时测试失败。
- [x] 添加最小 `healthStatus()` 实现，不引入 Fastify 路由或业务逻辑。
- [x] 运行目标测试和四个根命令，全部通过。

**验证：**

```powershell
pnpm vitest run tests/unit/foundation/health.test.ts
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

预期：健康测试通过，完整 workspace 可测试、检查和构建。

---

## 提交 4：记录 T05 结果

**提交信息：** `docs: 记录T05验证结果`

**修改：** `PLAN.md`、`AGENT_LOG.md`、`guiding.md`

- [x] 记录 OPEN-03 的批准版本、主要提交、验证命令和结果。
- [x] 做一次轻量范围检查：确认未提前实现 T06 以后功能，确认没有真实凭据或构建产物进入 Git。
- [x] 核心命令在 Codex Node 24 + pnpm 11.14 环境复验通过；未发生需修复的 T05 问题。

**验证：**

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
git status --short
```

预期：核心命令全部成功，记录与实际提交一致。

---

## 提交 5：清空 T05 规划

**提交信息：** `docs: 清空T05任务规划`

**修改：** 只清空 `guiding.md`

- [ ] 确认提交 1–4 已完成且工作区无其他未提交改动。
- [ ] 清空本文件并单独提交；随后再推送和合并到 `dev`。

**验证：**

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git diff --check
git status --short
```
