# 完整 Coding Agent Harness 重新评估

## 1. 结论与文档地位

本文件记录 2026-07-22 对项目范围的重新评估，依据以下三份课程原始材料：

1. `guide/AI4SE_Final_Project_A_Coding_Agent_Harness.md`；
2. `guide/AI4SE_Final_Project_通用要求.md`；
3. `guide/Agent的一生.html` 中从裸循环到完整 Harness 的六阶段伪代码与概念说明。

`v1.1.0` 和 `ai4se-harness-0.2.0.tgz` 是已经通过测试的安全工具循环基线，但不是本项目希望达到的最终 Harness。它能连续接收独立任务，却不保留上一项任务的对话上下文；`JsonMemory` 只有存储与检索类，主循环没有写入、固化或真正使用长期记忆。因此，项目 Gate 重新打开，不能继续宣称最终完成。

项目负责人已于 2026-07-22 批准路线 B（教学级完整 Harness），但决定延期到后续开发时段再实施。恢复开发时，须先根据本文件完成正式设计与逐步实施计划，不得回到路线 A，也不得擅自扩展为路线 C。

## 2. 原始材料定义的完整运行节奏

完整 Harness 分为三个时间阶段：

1. **启动装配**：加载系统提示、规则文件、Skill 名片、内建工具、MCP、Hooks、Guardrail、Sandbox、Tracer、Memory 与 Retriever。
2. **每轮循环**：压缩上下文、列出能力菜单、调用 LLM 决策、把 assistant 文本与 Action 写回历史、审批并执行动作、把 Observation 写回历史、记录 Trace、运行反馈传感器并继续修正。
3. **会话收尾**：触发 SessionEnd Hook、固化长期记忆、刷新 Trace，返回最终答案。

作业 A 进一步要求决策、工具、上下文与记忆、治理、反馈、配置六个维度都有可运行的最低实现，并且移除真实 LLM 后仍能用 mock/stub 确定性验证。

## 3. 当前实现差距矩阵

| 能力 | 当前证据 | 状态 | 完整目标 |
| --- | --- | --- | --- |
| 自研 Agent 主循环 | `agent-loop.ts` | 已有 | 保留并改为完整消息上下文循环 |
| 可注入 LLM 与 mock | `LLMProvider`、`ScriptedMockLLM` | 已有 | Provider 返回 assistant 文本与 Action |
| 文件与命令工具 | `FileTools`、`CommandTool` | 已有 | 加入统一工具描述和执行元数据 |
| Action 解析与分发 | `parseAction`、`Dispatcher` | 已有 | 扩展记忆、Skill、MCP、子 Agent 动作 |
| 工具 Observation 回灌 | 单项任务内只保留最近 Observation | 部分 | 保存完整 assistant/action/observation 消息序列 |
| 会话对话历史 | 每个终端输入重新创建独立任务 | 缺失 | 同一会话后续任务可引用前文 |
| 跨会话 Memory | `JsonMemory` 类存在，主循环不调用 `upsert` | 缺失 | 循环内读写、会话末 consolidate、重启恢复 |
| RAG / Select | 仅对空 Memory 做关键词查找 | 缺失 | 从规则、记忆和项目知识中选择相关上下文 |
| Context Compress | 无 | 缺失 | 达到预算阈值时确定性裁剪并保留摘要与近期消息 |
| 规则文件 | 不自动读取 `AGENTS.md` / `CLAUDE.md` | 缺失 | 启动装配时按作用域加载并注入 |
| Skill | 无注册与渐进式披露 | 缺失 | 平时只提供描述，命中后加载完整指令 |
| MCP | 无协议边界 | 缺失 | 自研 MCP 工具适配接口、连接配置与 mock 测试 |
| 子 Agent / Isolate | 无 | 缺失 | 受限子 Harness、独立上下文、深度与总预算守卫 |
| Hooks | 无生命周期系统 | 缺失 | SessionStart、PreToolUse、PostToolUse、SessionEnd |
| Guardrail / HITL | `PolicyEngine`、`ApprovalGate` | 已有 | 纳入统一生命周期，逐动作审批 |
| Sandbox / 边界 | 路径围栏、命令白名单、超时、输出上限 | 部分 | 明确能力边界；外部 MCP 不伪称受本地沙箱保护 |
| 反馈传感器 | 工具结果分类存在 | 部分 | 代码变更后自动运行配置的 test/lint/typecheck 传感器 |
| Checkpoint / 回滚 | 无 | 缺失 | 副作用前状态快照，工具或传感器失败时可恢复 |
| Trace | Action、策略、Observation、停机原因 | 部分 | 补全 assistant 文本、会话、Hook、传感器和父子关系 |
| 会话收尾 | 无 consolidate / SessionEnd | 缺失 | 统一完成、预算耗尽、阻断和异常收尾 |
| 配置与凭据 | 严格配置、加密凭据、脱敏 | 已有 | 扩展新模块配置且保持秘密隔离 |
| CLI 分发 | 0.2.0 tarball、`start` | 部分 | 真正的上下文会话、记忆管理和扩展状态命令 |

## 4. 三种后续路线

### A. 只补作业硬缺口

补完整消息历史、Memory 写入与固化、规则加载和自动反馈传感器，保留现有工具与治理，不实现 Skill、MCP、子 Agent、Hooks 和 Checkpoint。

- 预计：3–4 个提交，约 15,000–25,000 tokens。
- 优点：最快满足作业 A 六维最低实现。
- 缺点：仍不等于《Agent 的一生》展示的完整 Harness，不符合当前项目负责人提出的目标。

### B. 教学级完整 Harness（推荐）

实现 HTML 中出现的全部核心概念，但控制在可确定性测试的教学规模：MCP 使用清晰适配接口和示例连接，不实现通用生产客户端；Skill 使用本地目录与渐进加载；子 Agent 串行执行并有严格深度/预算；Context 压缩采用确定性策略；Checkpoint 使用受控工作区快照。

- 预计：本次文档提交后再做 6 个实现提交，总计不超过 7 个提交。
- 预计代码与测试：约 1,500–2,500 行新增或修改。
- 预计 Codex 消耗：顺利约 35,000–50,000 tokens；出现 Provider、Windows 或 MCP 兼容问题时约 60,000–80,000 tokens。
- 预计人工时间：6–10 小时开发验证，另加 1–2 小时真人 Provider 与 Release 验收。
- 优点：与课程讲解、作业 A 和“最终 Harness”目标一致。
- 缺点：必须撤回当前完成判断，重新测试、打包并发布 `v2.0.0`。

### C. 生产级 OpenCode 克隆

在 B 的基础上增加全屏 TUI、并行 agent、完整 MCP 生态、LSP、Git worktree、流式输出、崩溃恢复、跨平台进程沙箱和成熟压缩模型。

- 预计：80,000 tokens 以上，远超 7 个提交与暑期作业合理范围。
- 结论：不建议。

## 5. 已批准的 CLI 产品体验

最终 CLI 采用接近 OpenCode 的面向用户流程，底层命令、配置文件和 Harness 动作不应成为普通用户的必备知识。

### 5.1 工作区规则

- 用户在哪个目录运行 `ai4se-harness`，哪个目录就是本次工作区。
- 不要求用户选择项目目录、传入 `--config` 或填写 `"workspace": "."`。
- Agent 的文件、命令、规则、Memory 和 Checkpoint 均以启动目录为边界。
- 项目运行数据由程序自动放在当前工作区的 `.ai4se` 中；该目录是内部实现细节。
- 切换项目时，用户退出 Agent，进入另一个目录再次运行 `ai4se-harness`。

### 5.2 首次启动与模型选择

- 普通入口只有 `ai4se-harness`；无参数运行必须启动 Agent，不再默认执行 smoke。
- 首次启动自动进入向导，内部完成配置文件、凭据存储、Memory、Trace 和 Checkpoint 初始化。
- 向导让用户选择 Provider、服务地址和模型，并以隐藏输入收取 API Key。
- Provider 支持模型列表时自动展示可用模型；无法获取列表时允许用户手动输入模型名称。
- 模型不得写死。用户可在会话中使用 `/model` 查看或切换模型，成功选择会保存为后续默认值。
- API Key 不得写入普通配置、命令参数、Trace、日志或 Git；原有加密与脱敏要求继续有效。

### 5.3 日常会话

正常使用流程只有：进入项目目录、运行 `ai4se-harness`、完成必要的本地凭据解锁、输入自然语言任务。一次解锁在当前进程内复用，不得要求每条消息重新输入密码。

同一会话的后续输入必须能够引用此前对话；会话结束时固化经过筛选和脱敏的长期记忆，重新启动后可以检索。普通命令限定为：

- `/new`：开始新对话；
- `/model`：查看或切换模型；
- `/memory`：查看或管理记忆；
- `/status`：查看当前工作区、Provider 和模型；
- `/help`：显示用户帮助；
- `/exit`：安全结束会话。

### 5.4 隐藏底层细节

普通输出应以助手回答、简短进度和必要审批为主，不默认打印 Action JSON、`read_file`、`run_command`、逐步 Trace、策略枚举或底层错误码。`credentials`、`smoke`、`start --config` 等旧入口可以为兼容性保留，但只能作为高级维护接口；诊断信息通过显式的 `doctor` 或 `--debug` 打开，不进入助教的普通使用说明。

## 6. 推荐路线的 7 个提交上限

当前文档重估作为第 1 个提交。路线 B 已获人工批准，后续实现限定为 6 个提交，每个提交内部保留 TDD 红–绿证据：

1. `docs: 重新基线化完整Harness范围`：本文件及 README、SPEC、PLAN 状态修正。
2. `feat: 建立面向用户的CLI与完整会话上下文`：当前目录工作区、首次向导、Provider/模型选择、消息历史、assistant 文本与 Action、Observation、规则加载、上下文预算与压缩。
3. `feat: 接入会话与长期记忆生命周期`：scratchpad、读写工具、consolidate、检索、重启恢复、CLI 记忆命令。
4. `feat: 加入Skill、MCP与生命周期Hooks`：能力目录、渐进式披露、MCP 适配边界、四类 Hook 与阻断结果。
5. `feat: 实现受限子Agent与上下文隔离`：子 Harness、摘要返回、深度/步数/总预算、父子 Trace。
6. `feat: 加入自动反馈传感器与Checkpoint`：变更检测、test/lint/typecheck、结果回灌、快照与恢复。
7. `release: 验收并发布完整Harness v2.0.0`：完整机制演示、真实 Provider、tarball、README、提交材料与 Release。

任何提交如果无法在一个审查单元内完成，应缩小该提交内部实现，而不是增加超过 7 个提交。

## 7. 最低验收场景

路线 B 只有同时满足以下场景才可重新宣称完成：

1. 同一终端会话中，第二个问题能引用第一个问题和回答；重启后能检索已固化的脱敏长期记忆。
2. 模型每轮产生的文本、Action 和工具 Observation 都进入上下文；窗口超限时压缩但保留目标、规则、摘要和近期消息。
3. `AGENTS.md` / `CLAUDE.md` 自动加载；Skill 未命中时只暴露描述，命中时才加载全文。
4. mock MCP 工具能被发现和调用；外部工具的治理边界有明确说明。
5. 子 Agent 使用独立上下文和受限工具，达到深度或总预算上限时确定性停止，只把摘要带回父会话。
6. PreToolUse Hook 或 Guardrail 能在副作用前阻断；PostToolUse 与 SessionEnd 可确定性执行。
7. 写代码后自动运行配置的传感器，失败报告回灌并驱动下一步修正；失败恢复不留下越界副作用。
8. Trace 能回放会话、父子 Agent、决策、动作、Observation、审批、Hook、传感器、记忆与停机原因，且不包含 API Key。
9. 所有机制在 mock/stub LLM 下有离线测试；真实 Provider 只作为额外验收，不承担机制正确性证明。
10. 在全新目录安装最终 tarball，只依据提交说明即可安全录入 Key、启动、验证、清除凭据。

11. 在任意项目目录直接运行 `ai4se-harness` 即以该目录为工作区；首次向导可选择 Provider 和模型，后续会话可用 `/model` 切换，普通流程不要求手动编辑 JSON 或使用 `--config`。

## 8. 已确认决策与恢复点

项目负责人已确认采用路线 B，并确认 CLI 必须面向普通用户：无参数启动、当前目录即工作区、首次向导完成内部配置、模型由用户选择、同一会话保留上下文、底层命令默认隐藏。本次只记录需求并暂停开发；下次从路线 B 的正式设计和第 2 个提交开始，不覆盖现有 `v1.1.0` 历史 Release。
