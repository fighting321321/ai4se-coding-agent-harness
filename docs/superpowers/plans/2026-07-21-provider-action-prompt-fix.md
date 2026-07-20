# Provider Action Prompt Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 OpenAI 兼容模型收到完整 Action schema，使简单问答稳定返回 Harness 可解析的 `finish` Action。

**Architecture:** 只收紧 `OpenAICompatibleProvider` 的系统提示，不修改解析器或执行安全边界。现有本地 HTTP stub 记录真实请求体，用它验证发出的提示契约。

**Tech Stack:** TypeScript、Node.js 24.14.0、Vitest 4.1.10、pnpm 11.14.0

## Global Constraints

- API Key 不得进入源码、配置、日志、Trace、Memory、测试输出或 Git。
- 不增加依赖，不修改 Action parser、Policy、Approval 或 Redactor。
- 新增或修改的代码注释使用中文。

---

### Task 1: 完整 Action schema 提示

**Files:**
- Modify: `tests/unit/harness/openai-compatible-provider.test.ts`
- Modify: `packages/harness/src/openai-compatible-provider.ts`

**Interfaces:**
- Consumes: `OpenAICompatibleProvider.complete(input: LLMInput): Promise<LLMOutput>`
- Produces: 请求体中精确、可测试的 system message；Provider 返回类型保持不变。

- [x] **Step 1: 写失败测试**

修改现有确定性请求测试，不再断言旧的一句话提示；从请求 JSON 中读取 system message，并断言它包含以下精确结构与约束：

```ts
expect(systemPrompt).toContain('{"type":"read_file","path":"相对路径"}');
expect(systemPrompt).toContain('{"type":"write_file","path":"相对路径","content":"文件内容"}');
expect(systemPrompt).toContain('{"type":"run_command","executable":"命令","args":["参数"]}');
expect(systemPrompt).toContain('{"type":"finish","summary":"最终回答"}');
expect(systemPrompt).toContain("普通问答或不需要工具时，必须使用 finish Action");
expect(systemPrompt).toContain("不要使用 action、respond 或 content 字段");
```

- [x] **Step 2: 运行测试并确认 RED**

Run:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/harness/openai-compatible-provider.test.ts
```

Expected: 新提示断言失败，原因是生产代码仍发送旧的一句话提示。

- [x] **Step 3: 实现最小修复**

在 `openai-compatible-provider.ts` 中定义单一 system prompt 常量，内容为：只返回 JSON、不返回 Markdown；列出四种合法 Action；普通问答使用 `finish`；禁止用旧替代字段。`complete` 请求体复用该常量。

- [x] **Step 4: 运行聚焦测试并确认 GREEN**

Run:

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/harness/openai-compatible-provider.test.ts tests/integration/harness/agent-loop.test.ts tests/integration/api/local-web-server.test.ts
```

Expected: 三个测试文件全部通过。

- [x] **Step 5: 运行完整门禁**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: 全部退出码为 0。

- [x] **Step 6: 本地真实 API smoke**

重新运行 `pnpm web:local`，在页面填写临时 Key、`https://njusehub.info/v1`、`qwen-turbo` 和简单问答。Expected: `completed`，Trace 的停止原因为 `finish`，Key 自动清空。

- [x] **Step 7: 整理 T11 历史**

将本修复的设计、计划、测试和实现折叠进原第 6 个 T11 提交，再单独重建最后的 `docs: 清空T11任务规划`，保持 `dev..HEAD` 恰好 7 个提交且最后提交只修改空的 `guiding.md`。
