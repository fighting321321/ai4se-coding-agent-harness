# T17 最终离线验收矩阵

本矩阵以 `FULL_HARNESS_REASSESSMENT.md` 第 7 节为基线。所有场景均由 `ScriptedMockLLM`、内存凭据保险库、本地文件系统或 `MockMcpConnection` 驱动，不访问网络、不读取真实 Provider 或真实凭据。

| 场景 | 自动化证据 | 关键断言 |
| --- | --- | --- |
| 全新工作区首次启动 | `tests/integration/harness/final-acceptance.test.ts`、`tests/unit/harness/first-run.test.ts` | 仅询问服务地址、隐藏 Key、模型；配置不含 Key |
| 连续对话与重启 Memory | `tests/integration/harness/final-acceptance.test.ts`、`tests/integration/harness/agent-loop.test.ts` | 后一题携带前文；固化后新实例可检索脱敏摘要 |
| 规则、压缩与 Skill | `tests/unit/harness/session-context.test.ts`、`tests/unit/harness/workspace-rules.test.ts`、`tests/integration/harness/extensions.test.ts` | 规则按作用域加载；超限确定性压缩；Skill 命中后才加载正文 |
| Mock MCP 与 Hook | `tests/integration/harness/extensions.test.ts`、`tests/unit/harness/hooks.test.ts` | 外部调用逐次审批；Pre 可零副作用阻断；Post/SessionEnd 顺序稳定 |
| 子 Agent | `tests/integration/harness/t16-loop.test.ts`、`tests/unit/harness/subagent.test.ts` | 独立上下文、最小工具集、深度与共享预算确定性停机 |
| Sensor 与 Checkpoint | `tests/integration/harness/t16-loop.test.ts`、`tests/unit/harness/sensor.test.ts`、`tests/unit/harness/checkpoint.test.ts` | 写后自动验证；失败恢复明确单文件；外部副作用不伪称回滚 |
| Trace 脱敏与回放 | `tests/integration/harness/agent-loop.test.ts`、`tests/unit/harness/trace.test.ts` | v3 串联会话、输入/模型摘要、审批、动作、Observation、Hook、Memory、扩展细节和停止原因；兼容 v1/v2；1 MiB 上限 |
| 失败停止 | `tests/integration/harness/agent-loop.test.ts`、`tests/integration/demos/mechanisms.test.ts` | Policy/Hook 在副作用前阻断；超时、环境错误、第二次业务失败和预算耗尽均停止 |
| 全新目录分发包 | `tests/integration/distribution/package-smoke.test.ts` | 离线安装、ESM 导入、显式 `smoke`、无参数 TTY 边界和帮助入口 |

真实 Provider 只作为总控合并前后的人工补充验收，不承担上述机制正确性的证明。
