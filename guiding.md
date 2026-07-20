# T11 静态 WebUI 与 GitLab Pages：精简提交计划

> 当前分支：`feat/t11-static-web`
>
> 基线：`dev` 提交 `469fe5a`，已包含 T05–T10、MR !12 合并记录及凭据/工作区安全收尾；基线测试 20/20 文件、218/218 用例通过。
>
> 总计 5 个提交，不超过 7 个。只实现静态说明站和 Pages 发布，不实现在线 Agent、API 连接、Key 输入、服务端状态、浏览器 e2e 或 T12 分发文档。

## 目标与设计

交付一个简洁中性的单页静态站，用固定且脱敏的 mock 数据解释项目价值、最小架构、治理阻断、失败反馈修正、Memory 摘要、运行轨迹和本地命令，并通过 GitLab Pages 发布。页面只消费仓库内 `demo-data.ts`，不请求 API、不执行 Agent、不读取任何凭据。

采用单页而不是路由站点：顶部价值说明与“静态 mock”边界，随后是架构、三个机制卡片、顺序 Trace、Memory/命令和安全说明。交互仅使用原生链接与跳转，不为课程作业引入状态库、路由器、组件库、图表库、外部字体或图片依赖。

## 固定边界

- React 19 + Vite 8 + TypeScript strict；Node 24、pnpm 11，不新增运行时依赖。
- 固定数据必须使用 fake 内容且不含可用 Key；页面不得出现输入框、密码框、fetch、WebSocket、EventSource 或 API 基址。
- 所有运行轨迹按 step 升序，明确显示 Action、Policy、Observation、状态和 stopReason；治理阻断与失败修正必须能独立看懂。
- 使用语义化 `header/nav/main/section/footer`、清晰标题层级、可见焦点、足够对比度和响应式布局；无需自定义复杂键盘逻辑。
- Vite 使用适合 GitLab 子路径的静态资源 base；Pages job 只发布 `apps/web/dist`，不携带凭据、Memory、Trace 或本地 `.ai4se` 文件。
- Pages URL/Pipeline 状态只能记录 GitLab 实际返回值；无法确认时明确记为待最终审计，不伪造。

## 预计文件

- 创建：`apps/web/src/demo-data.ts`
- 创建：`apps/web/src/App.tsx`
- 创建：`apps/web/src/styles.css`
- 创建：`tests/unit/web/static-page.test.ts`
- 修改：`apps/web/src/main.tsx`
- 修改：`apps/web/vite.config.ts`
- 修改：`apps/web/package.json`
- 修改：`.gitlab-ci.yml`
- 收尾修改：`PLAN.md`、`AGENT_LOG.md`、`guiding.md`

---

## 提交 1：建立 T11 规划

**提交信息：** `docs: 规划T11静态页面与Pages步骤`

- [x] 固定单页信息架构、mock 数据边界、Pages 发布方式和五个提交。
- [x] 明确页面不连接 API、不读取 Key、不声称在线执行 Agent。
- [x] 明确 TDD、可访问性、响应式、完整门禁和 URL 证据规则。
- [x] 本提交只修改 `guiding.md`。

**验证：**

```powershell
git diff --check
git diff --name-only
```

---

## 提交 2：用 RED 冻结静态页面契约

**提交信息：** `test: 定义T11静态页面契约`

- [ ] 创建 `tests/unit/web/static-page.test.ts`，使用 `react-dom/server` 渲染真实 App，不引入浏览器 DOM 测试库。
- [ ] 断言页面包含项目价值、静态 mock 边界、最小架构、治理阻断、失败修正、Memory 摘要、安装/测试/演示命令和安全限制。
- [ ] 断言 Trace step 顺序、deny/blocked 状态、首次 fail 后 Action 改变和第二次失败停机可见。
- [ ] 断言无 password/input/form、无真实 Key 形态、无 API 在线执行文案；导航与主要区域具备可识别语义。
- [ ] 为 Web workspace 增加精确测试脚本，运行并保存 App/demo-data 尚不存在产生的正确 RED。

**RED 命令：**

```powershell
pnpm --filter @ai4se/web test
```

---

## 提交 3：实现静态单页 RED → GREEN

**提交信息：** `feat: 实现T11静态机制展示页`

- [ ] 在 `demo-data.ts` 定义只读类型化数据：架构节点、三项机制、脱敏 Trace、Memory 摘要和命令；只用 fake 内容。
- [ ] 在 `App.tsx` 以语义化区域渲染 hero、边界提示、架构、机制卡片、顺序 Trace、Memory、命令和安全说明；避免无意义拆分组件。
- [ ] 在 `styles.css` 完成简洁中性视觉、状态色、可见焦点、代码块换行和窄屏单列布局；不使用远程资源。
- [ ] `main.tsx` 只挂载 App 与样式；`vite.config.ts` 设置可用于 GitLab 项目子路径的相对 base。
- [ ] 聚焦测试全部 GREEN，Web typecheck/build 通过；检查构建产物不含 Key、API 地址或本地运行文件。

**GREEN 命令：**

```powershell
pnpm --filter @ai4se/web test
pnpm --filter @ai4se/web typecheck
pnpm --filter @ai4se/web build
```

---

## 提交 4：接入 Pages、完成审查与记录

**提交信息：** `ci: 发布T11静态页面到Pages`

- [ ] 在 `.gitlab-ci.yml` 保留精确命名的 `unit-test`，新增后置 `pages` stage/job，构建 Web 并把 `apps/web/dist` 复制为 `public` artifact。
- [ ] Pages job 只在符合仓库默认分支发布，显式依赖测试门禁；不上传 `.ai4se`、Memory、Trace、凭据或源码临时文件。
- [ ] Spec 检查逐项核对价值、架构、固定 Trace、治理、反馈、Memory、命令、静态边界和 Pages；质量检查聚焦语义、键盘焦点、状态对比、响应式与构建路径。
- [ ] 修复所有 Critical；其他问题只在确有必要时处理，避免课程作业过度工程化。
- [ ] 运行完整门禁，更新 `PLAN.md`、`AGENT_LOG.md`；仅记录实际 MR/Pipeline/Pages URL，未取得时如实保留证据缺口。

**完整门禁：**

```powershell
pnpm test
pnpm demo
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

---

## 提交 5：清空 T11 规划

**提交信息：** `docs: 清空T11任务规划`

- [ ] 确认提交 1–4 完成、完整门禁通过、分支总提交数不超过 7、工作区无无关改动。
- [ ] 只清空 `guiding.md` 并提交。
- [ ] 推送 `feat/t11-static-web`，创建目标为 `dev` 的 MR；Pipeline/Pages 成功后合并，禁止 squash。

**验证：**

```powershell
if ((Get-Item guiding.md).Length -ne 0) { throw "guiding.md 未清空" }
git diff --check
git status --short
```
