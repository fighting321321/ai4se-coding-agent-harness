# @ai4se/harness

课程项目使用的 Coding Agent Harness 内核分发包。它提供动作解析、工具分发、治理、反馈、记忆、Trace、LLM 抽象和 Agent 主循环。

本包要求 Node.js 24。课程交付包可从项目的 [v1.1.0 GitLab Release](https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.1.0) 下载，文件名为 `ai4se-harness-0.2.0.tgz`。下载后安装并运行完全离线且不读取凭据的 smoke：

```powershell
pnpm add --global .\ai4se-harness-0.2.0.tgz
ai4se-harness smoke
```

准备一个不含 API Key 的 `.ai4se/config.json` 后，先以隐藏输入保存凭据，再启动连续终端会话：

```powershell
ai4se-harness credentials init
ai4se-harness start --config .ai4se/config.json
```

启动时只需输入一次主密码。进入 `ai4se>` 后可连续输入自然语言任务，并使用 `/help`、`/status`、`/trace`、`/clear`、`/exit`；每个写入动作仍会单独请求批准。一次性任务入口 `ai4se-harness --task "任务" --config .ai4se/config.json` 保持兼容。

也可以通过 ESM 导入：

```js
import { runInteractiveSession, runOfflineSmoke } from "@ai4se/harness";

console.log(await runOfflineSmoke());
```

该 tarball 通过 GitLab Release 分发，不代表已发布到公共 npm registry；项目暂未授予再分发许可证。
