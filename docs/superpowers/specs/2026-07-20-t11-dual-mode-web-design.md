# T11 双模式 WebUI 设计

## 目标

T11 同时交付两个明确隔离的使用模式：

1. GitLab Pages 上的公开静态演示，使用仓库内固定且脱敏的 mock 数据解释项目价值、架构、治理、反馈、Memory 和 Trace。
2. 仅在开发者本机启动的真实运行模式，允许用户手动填写 OpenAI-compatible API 地址、模型名、API Key 和任务，并通过本地 Fastify 服务调用现有 Harness。

公开页面不能接收凭据、不能调用模型，也不能声称在线运行 Agent。本地真实模式是辅助入口，不替代 T10 已有的加密凭据 CLI。

## 方案比较与选择

### 方案 A：浏览器直接调用模型服务

实现最少，但 API Key 会进入前端网络栈，受模型服务 CORS 限制，也无法安全复用 Node 侧的路径、命令、治理和记忆机制。因此不采用。

### 方案 B：公开静态页面与 localhost 后端双模式

公开部署只发布静态资源；本地开发时，WebUI 通过回环地址 Fastify 服务调用完整 Harness。浏览器只在一次运行期间持有用户手动输入的 Key，后端不落盘。该方案保留现有安全边界并满足真实 API 体验，确定采用。

### 方案 C：继续只提供静态页面和 CLI

范围最小且最安全，但不能满足用户希望从 WebUI 手动填写 API 并运行的需求。因此不采用。

## 架构

```text
公开 GitLab Pages
  apps/web 静态构建
    └─ 固定 mock 数据（无表单、无网络请求）

本地真实模式
  apps/web 本地页面
    └─ POST /api/runs
         └─ apps/api Fastify（仅 127.0.0.1）
              └─ packages/harness AgentLoop
                   ├─ OpenAICompatibleProvider
                   ├─ PolicyEngine / ApprovalGate
                   ├─ FileTools / CommandTool
                   ├─ JsonMemory
                   └─ 脱敏 Trace
```

Web 构建根据显式的 Vite 构建变量决定模式。Pages job 生成 `static` 模式；本地命令生成或启动 `local` 模式。不能仅依据浏览器 hostname 自动开放表单，避免部署配置错误时意外暴露真实运行入口。

## 组件职责

### `apps/web`

- `demo-data.ts`：只保存固定、虚构、脱敏的公开演示数据。
- `App.tsx`：渲染共享项目说明、架构、机制卡片和 Trace；仅在编译期 `local` 模式渲染真实运行表单。
- `local-run-client.ts`：定义请求/响应类型并调用相对路径 `/api/runs`；不缓存请求，不重试，不记录 Key。
- `styles.css`：提供中性、响应式、键盘可见焦点的单页样式。
- 表单字段包括任务、API 地址、模型名和密码型 API Key。API Key 使用受控内存状态，运行结束或用户清除时立即从组件状态移除；不使用 localStorage、sessionStorage、IndexedDB 或 URL 参数。

### `apps/api`

- 保留现有 CLI 行为。
- 新增本地 Web server 入口和 run route。服务默认绑定 `127.0.0.1`，不监听局域网地址。
- route 对请求做运行时校验，拒绝未知字段、空任务、空模型、空 Key、非 HTTPS 远端 endpoint；回环 endpoint 可继续使用 HTTP 以支持测试。
- route 为每次请求组装现有 AgentLoop。API Key 只传给 Provider 与 Redactor，不写入普通配置、磁盘凭据、Trace、Memory、错误响应或日志。
- Web 模式不提供交互式批准协议。`allow` 动作照常执行，`deny` 动作阻断，`ask` 动作由 ApprovalGate 默认拒绝，并在结果中明确显示需要改用 CLI 进行人工批准。
- 返回精简、脱敏的运行结果：最终状态、停止原因、摘要和 Trace 展示字段。响应不得回显请求配置或模型原始敏感内容。

### 开发与发布命令

- 本地真实模式由一个根脚本同时启动 API 与 Vite，Vite 将 `/api` 代理到回环 Fastify 服务。
- Web 的普通 build 固定为静态模式；GitLab Pages 只复制 `apps/web/dist` 到 `public`。
- CI 不启动真实 API，不使用真实 Key，所有网络行为使用本地 HTTP stub。

## 数据流

1. 用户在本地页面填写任务、endpoint、model 和 API Key。
2. 页面在提交时创建一次 JSON 请求，经 Vite 同源代理发给 `127.0.0.1` Fastify。
3. Fastify 验证请求、Content-Type、Body 大小和 Origin；拒绝来自 GitLab Pages 或其他远端站点的请求。
4. 后端用请求中的 Provider 配置和 Key 组装一次 AgentLoop，工作区和工具限制仍读取本地 `.ai4se/config.json`，请求不能覆盖工作区、命令白名单、超时或步数上限。
5. Harness 执行既有 Memory → Provider → Action → Policy → Tool → Feedback → Trace 循环。
6. 后端对结果和错误再次脱敏，仅返回前端展示所需字段。
7. 前端收到结果后清除 API Key 状态，并按 step 顺序显示 Trace。

## 安全边界

- localhost 服务只绑定 `127.0.0.1`，固定端口可由非敏感环境变量覆盖。
- 只接受本地开发页面 Origin；不配置通配 CORS，不接受无 Origin 的浏览器跨站写请求。测试和 CLI 内部调用使用 Fastify injection，不依赖 CORS。
- 请求体设置较小上限；只接受 `application/json`；错误统一为稳定代码和安全中文信息。
- API Key 不进入命令行参数、环境变量、URL、浏览器存储、服务器日志、Trace、Memory、测试快照或 Git。
- Pages artifact 只包含 Web 静态构建产物，并以测试证明不包含表单、Key 字段、localhost API 地址或本地模式文案。
- 真实模式仍可能在浏览器和 Node 进程内存中短暂持有明文 Key；页面必须明确提示这一限制，并建议日常使用 T10 加密凭据 CLI。

## 错误处理

- 表单本地校验失败时不发请求，并把错误与字段关联。
- 连接不到 localhost 服务时显示“本地服务未启动”，不把它描述为模型错误。
- 401、429、远端 5xx、Provider 协议错误和 Harness 停机原因映射为稳定、安全的展示状态；不显示远端响应正文。
- 同一页面一次只允许一个运行请求；运行中禁用再次提交。首版不实现取消、流式输出、运行历史或自动重试。

## 测试与验收

### RED → GREEN 单元与集成测试

- 静态 App SSR：包含项目价值、架构、固定 Trace、治理、反馈、Memory、命令和静态边界；不包含真实运行表单或在线 Agent 宣称。
- 本地 App SSR/组件边界：只有显式 `local` 模式包含任务、endpoint、model、password 类型 Key 输入和运行按钮。
- API route：有效请求调用 Harness 组装边界；无效字段、远端 HTTP endpoint、错误 Origin 和过大请求被拒绝。
- 零泄露：成功、401、429、5xx 和内部异常的响应、日志、Trace、Memory 均不包含测试 Key。
- Web client：提交成功或失败后清除 Key，不使用浏览器持久化 API。
- Pages job：构建静态模式并只发布 `apps/web/dist`。

### 完整门禁

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm demo`
- Web 静态产物敏感文本扫描
- T11 分支 diff 与提交数检查

真实学校 API smoke 只能由项目负责人在本机手动执行；自动测试与 CI 不接触真实凭据，也不伪造真实服务成功证据。

## 明确不做

- 不部署线上后端，不让 Pages 直接调用模型。
- 不在 WebUI 管理、持久化或回显凭据。
- 不实现 SSE/WebSocket、取消、历史记录、多用户、登录、复杂审批或远程工作区。
- 不改变 Harness 的核心协议，不引入现成 Agent Runner。
- 不替代 T10 CLI 的加密凭据工作流。
