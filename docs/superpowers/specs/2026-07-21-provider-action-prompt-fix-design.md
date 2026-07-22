# T11 Provider Action 提示修复设计

## 背景

真实学校 API 使用 `qwen-turbo` 返回 HTTP 200，但当前系统提示只要求“返回 JSON Action 对象”，未声明 Action schema。模型实际返回 `{"action":"respond","content":"..."}`，Provider 可解析该 JSON，Harness 的 `parseAction` 随后以 `parse_error` 终止。

## 已验证假设

使用同一临时 Key、同一模型与同一任务，仅将系统提示改为列出四种合法 Action，并明确普通问答使用 `finish` 后，模型返回 `{"type":"finish","summary":"..."}`。因此根因是提示协议不完整，而非 Key、Base URL、模型 ID、网络或解析器缺陷。

## 设计

- 只修改 `OpenAICompatibleProvider` 的系统提示，明确 `read_file`、`write_file`、`run_command`、`finish` 的精确 JSON 结构。
- 明确禁止 Markdown、解释文字以及 `action`、`respond`、`content` 等替代字段。
- 普通问答或无需工具的任务必须使用 `finish`。
- 不修改 `parseAction`、Policy、Approval、Redactor、网络错误映射或响应 schema，避免放宽安全边界。
- 新增 Provider 请求体回归测试，断言发给真实兼容端点的系统提示包含四种 Action schema 和 `finish` 约束。

## 验收

- 新测试在旧提示下按预期失败，在新提示下通过。
- Provider、AgentLoop、API 与 Web 相关测试通过。
- 使用临时 Key 在本地 Web 中运行简单问答，得到 `completed`、`finish` Trace 和安全摘要。
- 临时 Key 不进入源码、配置、日志、Trace、Memory、测试输出或 Git。
