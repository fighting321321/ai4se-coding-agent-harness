# T15：Skill、MCP 与生命周期 Hooks

## 目标

为教学级 Harness 增加三个可替换、可治理、可离线验证的扩展边界：本地 Skill 渐进加载、最小 MCP 工具适配、四类生命周期 Hooks。完成后停在本分支，等待项目负责人检查并合并回 `dev`。

## 固定边界

- 分支：`feat/t15-skills-mcp-hooks`。
- 以 `docs/assessments/FULL_HARNESS_REASSESSMENT.md` 第 2、3、6、7 节为准。
- 复用现有 `AgentLoop`、`SessionContext`、Policy、Approval、Dispatcher、Trace 和 T14 Memory 生命周期。
- Skill 采用工作区内本地目录与 `SKILL.md`，平时只暴露名称和简介，明确命中后才加载完整指令。
- MCP 只实现清晰的自研适配接口、工具发现和 mock 调用；不实现通用生产级协议客户端，不连接真实外部 MCP 服务。
- Hooks 只实现 `SessionStart`、`PreToolUse`、`PostToolUse`、`SessionEnd`，执行顺序必须稳定且错误结果可治理。
- 外部 MCP 工具不得伪称受本地文件/命令沙箱保护；每次副作用调用仍须经过 Policy、Hook 和必要 Approval。
- 不实现子 Agent、自动反馈传感器或 Checkpoint；这些属于 T16。
- 不读取 `.ai4se/temp-api-key.txt`，不使用真实 Provider，不记录或提交任何凭据。
- 本分支总提交数不得超过 7 个；首提交仅写本文件。

## 提交步骤

### 提交 1：任务指导

- 写入本 `guiding.md`。
- 不修改产品代码。

### 提交 2：建立生命周期 Hook 系统

- 定义可注入 Hook 接口、输入、输出、错误和固定执行顺序。
- `SessionStart` 每个交互会话执行一次，`SessionEnd` 在正常退出、EOF 和可控异常时执行一次。
- `PreToolUse` 在任何工具副作用前运行，并能确定性阻断动作。
- `PostToolUse` 在工具完成后接收脱敏结果；失败 Hook 不得泄露原始异常或秘密。
- Hook 事件写入 Trace，并与 Policy、Approval 的职责清晰分离。
- 先添加失败测试，再完成最小实现。

### 提交 3：实现 Skill 注册与渐进加载

- 在工作区安全边界内发现约定目录中的本地 Skill；拒绝路径逃逸、符号链接越界、超大文件和无效元数据。
- 启动装配时只向模型提供稳定排序的 Skill 名片，不默认加载完整正文。
- 模型明确选择或命中 Skill 后，才读取并注入对应 `SKILL.md` 完整指令。
- 相同 Skill 在会话内避免重复加载；Skill 内容不能覆盖系统安全约束。
- 缺失、损坏或不可读 Skill 必须产生固定、脱敏、可测试的结果。

### 提交 4：实现最小 MCP 适配与 mock 工具

- 定义 MCP 连接、工具描述、调用请求、调用结果和错误的自研适配边界。
- 支持启动时发现 mock MCP 工具，并将稳定、限长的工具名片加入能力菜单。
- MCP Action 必须通过统一分发、PreToolUse、Policy/Approval 和 PostToolUse，不能绕过治理。
- 明确标注 MCP 是外部信任边界；本地 PathGuard 和命令白名单只保护本地工具。
- 提供完全离线的 mock MCP 成功、失败、超时、无效结果与秘密脱敏测试。

### 提交 5：整合 Skill、MCP、Hooks 与 Trace

- Agent 每轮看到统一且限长的能力菜单：内建工具、Skill 名片、MCP 工具描述。
- Skill 加载、MCP 调用和四类 Hook 均进入 Trace，并记录会话关系、状态和停止原因。
- 验证 PreToolUse 阻断发生在副作用前，PostToolUse 只在规定场景运行，SessionEnd 不重复。
- 验证 T13 会话上下文和 T14 Memory 的行为不退化，秘密不会进入上下文、Trace、Memory 或普通输出。
- 所有机制必须能在 `ScriptedMockLLM` 和 mock MCP 下确定性回放。

### 提交 6：集成验收与收尾

- 完成 Hook 生命周期、Skill 渐进加载和 MCP 发现/调用的端到端离线场景。
- 验证损坏 Skill、Hook 阻断、MCP 失败与会话异常的组合行为。
- 使用统一入口运行 `test`、`lint`、`typecheck`、`build` 和 `audit`；若遇到 `spawn EPERM`，获准后原样重跑。
- 更新必要的 README、SPEC、PLAN、AGENT_LOG 和重新评估矩阵。
- 清空 `guiding.md` 后提交，确保本分支总提交数不超过 7 个。

## 完成标准

1. 四类 Hook 在正确生命周期点稳定执行，PreToolUse 能在副作用前阻断。
2. Skill 未命中时只暴露名片，命中后才安全加载完整指令。
3. mock MCP 工具可以被发现、治理、调用并回灌 Observation。
4. MCP 外部信任边界有代码与文档说明，不冒充本地沙箱。
5. Skill、MCP、Hook 事件进入脱敏 Trace，且不破坏会话与 Memory。
6. 所有机制均有 mock/stub 离线测试，不依赖真实 Key、网络或 Provider。
7. 统一门禁通过，工作树干净，分支停在等待负责人合并的状态。

## 停止条件

- 不合并到 `dev`，不创建或合并 MR，不发布版本。
- 不实现生产级 MCP 客户端、远程市场、动态插件安装或并行扩展系统。
- 如果必须扩大到 T16 范围，停止并向项目负责人说明。
- 如果预计超过 7 个提交，先停止并重新拆分，不得强行压缩历史。
