# T12：分发、文档与最终交付

## 任务目标

从已包含 T11 MR !13 的最新 `dev` 基线完成课程作业的最后交付：生成可安装、可运行的 npm tarball，补齐课程要求的 README 与第三方许可证说明，由项目负责人本人提交反思，并以自动化审计和真实 GitLab 证据完成收尾。

本任务不增加数据库、线上后端、多用户、Docker、新 Provider 或其他产品功能。分支固定为 `docs/t12-final-delivery`，总计 6 个提交，不得超过 7 个提交，不 squash。

## 开始前基线

- T11 已通过 MR !13 以 merge commit `7c68221` 合入 `dev`。
- Windows pull 后暴露的 CRLF 契约测试问题已在 `dev` 提交 `c0acb46` 修复。
- T12 分支创建前的新鲜基线为 25/25 个测试文件、282/282 个用例通过。
- GitLab Pipeline 和 Pages 必须在本任务中用真实 URL/status 核验；不知道时明确记录证据缺口，不猜测、不伪造。
- 任何 API Key、主密码或疑似真实凭据都不得写入聊天、命令参数、源码、测试输出、文档或 Git。若扫描命中疑似真实值，立即停止并请负责人撤销、清理后再继续。

## 提交 1：规划 T12 最终交付（当前提交）

**提交信息：** `docs: 规划T12最终交付步骤`

**只修改：**

- `guiding.md`

**完成条件：**

- 6 个提交与每步边界明确，每一步对应一个提交。
- 覆盖 npm tarball、全新目录离线 smoke、README、许可证、本人反思、CI、凭据扫描、Pages、最终 `dev → main` MR 和 `main` Pipeline。
- 不提前实现后续步骤。

## 提交 2：实现 npm tarball 与离线安装 smoke

**提交信息：** `feat: 增加Harness分发包与离线smoke`

**预计修改：**

- `packages/harness/package.json`
- `packages/harness/tsconfig.json`
- `packages/harness/src/` 下最小 CLI 入口及必要导出
- 根 `package.json`、`pnpm-lock.yaml`
- `tests/integration/distribution/package-smoke.test.ts`

**TDD 与实现：**

1. 先写失败的分发测试，证明当前包仍为 private、tarball 缺少可运行入口，且无法在全新临时目录完成安装/导入/命令运行。
2. 只把 `@ai4se/harness` 调整为课程交付所需的可打包模块：tarball 仅包含 `dist`、类型声明、README/许可证等必要文件，声明 Node 24 与正确的 `exports`/`bin`。
3. CLI 只提供确定性的离线 smoke/demo，不读取真实 Key、不访问网络、不复制 `apps/api` 或 Web 服务能力。
4. smoke 必须实际执行 build → `pnpm --filter @ai4se/harness pack` → 在全新临时目录安装生成的 `.tgz` → ESM import → 运行已安装命令，并断言退出码与稳定输出；不得仅检查 tarball 文件存在。
5. tarball、临时安装目录和构建产物不得进入 Git。

**验证：**

```powershell
pnpm test -- tests/integration/distribution/package-smoke.test.ts
pnpm --filter @ai4se/harness typecheck
pnpm --filter @ai4se/harness build
pnpm --filter @ai4se/harness pack
git diff --check
```

## 提交 3：补齐 README 与许可证说明

**提交信息：** `docs: 补齐课程交付与许可证说明`

**预计修改：**

- `README.md`
- `LICENSES.md`
- 必要时同步 package 元数据

**内容要求：**

- README 使用真实、可复制的命令，包含项目简介、最小架构与主要贡献、安装、CLI/本地 Web 运行、测试、三项 demo、静态 Pages URL、凭据初始化/状态/更新/清除、目录结构、安全边界、npm tarball 分发、已知限制。
- 明确 Pages 只是静态 mock 演示，本地 Web 才能调用回环 API；真实 Key 不进入 Pages、Git、Trace、Memory 或浏览器存储。
- Pages URL 只能填写 GitLab 实际返回且人工访问成功的地址；若尚未部署，先保留清晰的待核验说明，不编造 URL。
- `LICENSES.md` 根据实际直接依赖及其包元数据列出第三方名称、版本/范围、许可证与用途；不凭记忆猜许可证。
- 文档不得声称未完成的 Pipeline、Pages、平台兼容或发布结果已经成功。

**验证：**

```powershell
pnpm test
pnpm lint
git diff --check
```

并逐条对照 `guide/AI4SE_Final_Project_通用要求.md`、`guide/AI4SE_Final_Project_A_Coding_Agent_Harness.md` 与 `SPEC.md` 的 README/分发要求。

## 提交 4：提交项目负责人本人反思

**提交信息：** `docs: 完成项目负责人课程反思`

**只创建或修改：**

- `REFLECTION.md`

**负责人必做：**

- 正文必须由项目负责人徐黄浩本人撰写并提供，长度为 1500–2500 个中文字符（按课程口径复核）。
- 内容至少覆盖本人承担的工作、需求与范围取舍、Harness 六维设计、反馈重点维度、安全与真实 API 调试、测试/TDD/分支协作、遇到的问题、学习收获与后续改进。
- AI 不得代写。若负责人明确要求润色，只能在不新增个人经历或结论的前提下修改表达，并在文末如实标注 AI 辅助范围。
- 在负责人未提供正文时暂停此提交，不用占位文本伪装完成。

**验证：**

- 人工确认作者、事实和字数。
- 搜索并清除真实 Key、主密码、内部临时文件路径及不应公开的响应正文。
- `git diff --check` 通过。

## 提交 5：执行最终自动化审计并补齐交付证据

**提交信息：** `ci: 完成最终交付审计`

**预计修改：**

- `scripts/final-audit.mjs` 及相应测试
- `.gitlab-ci.yml`
- 根 `package.json`、`pnpm-lock.yaml`
- `SPEC_PROCESS.md`
- `PLAN.md`
- `AGENT_LOG.md`
- 必要的分发/CI 契约测试

**TDD 与审计：**

1. 先以失败测试锁定最终 CI 契约：精确名称 `unit-test` 必须执行 install、test、lint、typecheck、build、demo、secret scan 与 package build；Pages job 仍只发布静态 Web artifact。
2. 增加最小跨平台审计入口，检查当前受控文件和完整 Git 历史中的高置信度凭据模式；测试只能使用明显 fake 值。疑似真实凭据命中时必须非零退出并停止后续交付，由负责人撤销和人工清理，禁止自动改写历史。
3. 新鲜运行全部本地门禁、tarball 全新目录 smoke、静态 Pages artifact 边界扫描；记录实际命令、数量和结果，不复制旧结果冒充新验证。
4. 核验 MR !6–!13 可确认的合并记录、T12 MR、Pipeline URL/status 与公开 Pages URL。无法访问的远端证据在 PLAN/AGENT_LOG 中明确标记缺口。
5. 做一次 SPEC/原始 guide 合规检查和一次代码质量检查；只修复阻断交付的问题，不扩展功能。

**完整门禁：**

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm demo
pnpm --filter @ai4se/harness pack
pnpm final:audit
git diff --check
git status --short
```

**远端完成条件：**

- T12 分支 Pipeline passed，Pages 使用真实 URL 可访问。
- T12 以非 squash MR 合入 `dev`。
- 最终创建并合并 `dev → main` MR，且 `main` 最新 Pipeline passed。
- 若当前对话无权完成远端操作，只记录准确的待办与可复制步骤，不伪造完成。

## 提交 6：清空 T12 规划并交接

**提交信息：** `docs: 清空T12任务规划`

**只修改：**

- `guiding.md`

**完成条件：**

- 先确认提交 2–5 均已完成，工作区没有未提交文件，分支总提交数不超过 7。
- 再将 `guiding.md` 清空，不删除文件。
- 复核完整门禁的最新结果与 PLAN/AGENT_LOG 一致。
- 向主控对话交接分支名、6 个提交、测试结果、tarball smoke、凭据扫描、Pages/Pipeline 真实状态以及任何证据缺口。

## 停止条件

- 发现疑似真实凭据：立即停止，交由负责人撤销并逐个明确处理相关文件。
- 负责人尚未提供本人反思：暂停提交 4，不代写、不用占位内容冒充完成。
- Pages 或 Pipeline 无法核验：如实记录为外部证据缺口，不能写成已通过。
- 任一实现需要恢复数据库、线上后端、Docker、多用户或其他超范围功能：拒绝扩展，回到 SPEC 的最小课程作业边界。
