# GitLab Release 简易交付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取消当前实例不可用的 GitLab Pages 部署，统一全部交付文档，并以 `v1.0.0` GitLab Release 和可安装 CLI tarball 完成可直接提交的课程作业。

**Architecture:** 现有 `unit-test` 作业继续完成测试、构建、打包和审计，并保存 `ai4se-harness-0.1.0.tgz`。README 将 GitLab Release 作为唯一托管交付入口；WebUI 只保留本地模式，不新增服务器、数据库或自动发布系统。

**Tech Stack:** GitLab CI、Node.js 24.14.0、pnpm 11.14.0、Vitest、npm-compatible tarball、Markdown。

## Global Constraints

- Windows/Codex 命令统一使用 `powershell -NoProfile -File .\scripts\project-env.ps1 <task>`。
- 不得提交 API Key、密码、token 或其他凭据。
- 不迁移 GitHub，不增加数据库，不开发新的 WebUI 功能，不建设自动 Release 流水线。
- 所有修改直接提交到 `dev`，本轮实现提交数控制在 2 个以内。
- GitLab Release 标签为 `v1.0.0`；CLI 包文件名为 `ai4se-harness-0.1.0.tgz`。

---

### Task 1: 移除无效 Pages 部署

**Files:**
- Modify: `.gitlab-ci.yml`
- Test: `tests/unit/ci/pipeline-contract.test.ts`

**Interfaces:**
- Consumes: `unit-test` 作业生成的 `.ai4se/harness-pack/*.tgz`。
- Produces: 只有测试与打包职责、不会伪装为 Pages 部署的 GitLab 流水线。

- [ ] **Step 1: 将 Pages 契约改为“无 Pages 作业”并保持 CLI 产物契约**

在 `tests/unit/ci/pipeline-contract.test.ts` 中删除当前“发布静态 Web”测试，新增：

```ts
it("仅保留可下载的 CLI 交付产物，不声明不可用的 Pages 部署", () => {
  const ci = readFileSync(".gitlab-ci.yml", "utf8");

  expect(ci).not.toMatch(/^pages:/mu);
  expect(ci).not.toContain("$CI_PAGES_URL");
  expect(ci).toContain("pnpm --filter @ai4se/harness pack");
  expect(ci).toContain(".ai4se/harness-pack/*.tgz");
  expect(ci).toContain("expire_in: 1 year");
});
```

- [ ] **Step 2: 运行测试并确认新契约失败**

Run:

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 test
```

Expected: `pipeline-contract.test.ts` 因 `.gitlab-ci.yml` 仍存在顶层 `pages:` 而失败。

- [ ] **Step 3: 删除 Pages 阶段和作业**

将 `.gitlab-ci.yml` 的阶段收缩为：

```yaml
stages:
  - test
```

完整删除顶层 `pages:` 作业；保留 `unit-test` 及其 `.ai4se/harness-pack/*.tgz` 产物配置不变。

- [ ] **Step 4: 运行测试并确认通过**

Run:

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 test
```

Expected: 28 个测试文件、315 项测试全部通过。

- [ ] **Step 5: 提交流水线收缩**

```powershell
git add -- .gitlab-ci.yml tests/unit/ci/pipeline-contract.test.ts
git commit -m "ci: 改用Release交付CLI产物"
```

### Task 2: 统一全部交付文档

**Files:**
- Modify: `README.md`
- Modify: `SPEC.md`
- Modify: `PLAN.md`
- Modify: `SPEC_PROCESS.md`
- Modify: `AGENT_LOG.md`
- Modify: `REFLECTION.md`
- Modify: `docs/assessments/COLD_START_VALIDATION.md`
- Modify: `AGENTS.md`
- Modify: `packages/harness/README.md`
- Modify: `docs/superpowers/specs/2026-07-20-t11-dual-mode-web-design.md`
- Modify: `docs/superpowers/plans/2026-07-20-t11-dual-mode-web.md`
- Test: `tests/unit/audit/final-audit.test.ts`

**Interfaces:**
- Consumes: GitLab Release 固定地址和现有 `ai4se-harness` CLI。
- Produces: 助教可以从 README 进入 Release、下载 tarball、安装并运行 smoke，且所有当前文档对交付状态的描述一致。

- [ ] **Step 1: 添加 README 交付契约测试**

在 `tests/unit/audit/final-audit.test.ts` 中新增测试，读取关键交付文档并断言：

```ts
it("将 v1.0.0 Release 作为托管交付入口", () => {
  const readme = readFileSync("README.md", "utf8");
  const spec = readFileSync("SPEC.md", "utf8");
  const plan = readFileSync("PLAN.md", "utf8");

  expect(readme).toContain("/-/releases/v1.0.0");
  expect(readme).toContain("ai4se-harness-0.1.0.tgz");
  expect(readme).toContain("ai4se-harness smoke");
  expect(readme).not.toContain("真实 Pages URL：**待最终审计核验**");
  expect(spec).toContain("GitLab Release");
  expect(plan).toContain("v1.0.0");
  expect(spec).not.toContain("最新 Pipeline、公开 Pages/Release URL 与最终 `dev → main` 待核验");
  expect(plan).not.toContain("等待最新 Pipeline、公开 Pages/Release URL 与最终 `dev → main`");
});
```

- [ ] **Step 2: 运行测试并确认 README 契约失败**

Run:

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 test
```

Expected: 新测试因 README/SPEC/PLAN 尚未统一为 `v1.0.0` Release 交付而失败。

- [ ] **Step 3: 更新 README**

将“GitLab Pages：只读静态 mock”改为“托管交付与本地 WebUI”，内容必须包含：

```markdown
## 托管交付：GitLab Release

课程检查入口：[v1.0.0 Release](https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.0.0)。学校 GitLab 当前未提供可用的公开 Pages 地址，因此本项目采用助教允许的 CLI Release 方式交付。

从 Release 下载 `ai4se-harness-0.1.0.tgz` 后，在 Node.js 24 环境安装并验证：

```powershell
pnpm add --global .\ai4se-harness-0.1.0.tgz
ai4se-harness smoke
```

WebUI 仍可通过仓库统一入口在本地运行；静态页面只用于脱敏架构演示，不接收 API Key，也不连接线上后端。
```

同步完成以下文档收尾：

- `SPEC.md`：升级文档版本与 Gate，范围、架构、技术选型、验收映射和风险统一改为“本地 WebUI + GitLab Release”；记录助教部署补充说明取代原始 WebUI URL 要求。
- `PLAN.md`：标记 T01–T12 和最终本地/远端流水线完成，将 T11/T12 的当前交付结论改为 Release；历史执行证据保持原文。
- `SPEC_PROCESS.md`、`AGENT_LOG.md`：追加 2026-07-22 最终迭代，记录 Pages 失败证据、人工选择方案 A、Release 决策与流水线结果。
- `REFLECTION.md`：保留学生本人观点，补充“真实部署环境迫使方案从 Pages 收缩到 Release”的经验，并保留 AI 仅辅助整理润色的声明。
- `docs/assessments/COLD_START_VALIDATION.md`：在标题后标明这是实现前的历史验证记录，未完成步骤不代表当前项目缺口。
- `AGENTS.md`：当前状态改为 T01–T12 完成、最终交付采用 Release、后续只在 `dev` 收尾。
- `packages/harness/README.md`：增加 Release 获取、Node 24 安装和 `ai4se-harness smoke`。
- T11 的旧设计与计划：标题后增加“历史方案，已由 2026-07-22 Release 方案取代”的醒目标记，不删除历史内容。
- `LICENSES.md`、`guiding.md` 和已完成的非 T11 历史计划无需改写；前者内容仍准确，后者按项目规则保持为空。

- [ ] **Step 4: 运行测试并确认通过**

Run:

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 test
```

Expected: 全部测试通过，关键交付文档无 Pages 占位或过期待核验状态。

- [ ] **Step 5: 提交交付文档**

```powershell
git add -- README.md SPEC.md PLAN.md SPEC_PROCESS.md AGENT_LOG.md REFLECTION.md docs/assessments/COLD_START_VALIDATION.md AGENTS.md packages/harness/README.md docs/superpowers/specs/2026-07-20-t11-dual-mode-web-design.md docs/superpowers/plans/2026-07-20-t11-dual-mode-web.md tests/unit/audit/final-audit.test.ts
git commit -m "docs: 统一最终作业交付文档"
```

### Task 3: 完整验证与远端 Release

**Files:**
- Verify: `.gitlab-ci.yml`
- Verify: `README.md`
- Verify: `packages/harness/package.json`

**Interfaces:**
- Consumes: Task 1 的 CI tarball 与 Task 2 的交付说明。
- Produces: `main` 上可访问的 `v1.0.0` Release 和可安装附件。

- [ ] **Step 1: 运行完整本地门禁**

Run:

```powershell
powershell -NoProfile -File .\scripts\project-env.ps1 all
```

Expected: test、lint、typecheck、build、demo、audit 全部退出码为 0。

- [ ] **Step 2: 推送 dev 并合并到 main**

```powershell
git push origin dev
```

在 GitLab 创建 `dev -> main` 合并请求，等待 `main` 的 `unit-test` 作业通过并下载其中的 `ai4se-harness-0.1.0.tgz`。

- [ ] **Step 3: 创建并推送标签**

在本地同步已通过流水线的 `main` 后执行：

```powershell
git tag -a v1.0.0 -m "AI4SE Agent Harness v1.0.0"
git push origin v1.0.0
```

- [ ] **Step 4: 创建 GitLab Release**

在 GitLab “部署 -> 发布”中选择标签 `v1.0.0`，标题填写 `AI4SE Agent Harness v1.0.0`，上传 `ai4se-harness-0.1.0.tgz`，描述包含 Node.js 24 要求、安装命令和 `ai4se-harness smoke` 验证命令。

- [ ] **Step 5: 验证最终交付**

确认以下地址可访问：

```text
https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.0.0
```

从 Release 重新下载附件，在新的临时目录安装并运行 `ai4se-harness smoke`；输出成功后记录最终 Release 链接。
