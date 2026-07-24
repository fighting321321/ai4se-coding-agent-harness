# @ai4se/harness

课程项目使用的 Coding Agent Harness 内核分发包。它提供动作解析、工具分发、治理、反馈、记忆、Trace、LLM 抽象和 Agent 主循环。

本包要求 Node.js 24。课程交付包可从项目的 [v1.1.0 GitLab Release](https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.1.0) 下载，文件名为 `ai4se-harness-0.2.0.tgz`。下载后安装并运行完全离线且不读取凭据的 smoke：

```powershell
pnpm add --global .\ai4se-harness-0.2.0.tgz
ai4se-harness smoke
```

准备一个不含 API Key 的 `.ai4se/config.json`：

```json
{
  "workspace": ".",
  "allowedCommands": [],
  "maxSteps": 8,
  "commandTimeoutMs": 60000,
  "maxOutputBytes": 32768,
  "memoryPath": ".ai4se/memory.json",
  "provider": {
    "baseUrl": "https://your-provider.example/v1",
    "model": "your-model-name"
  }
}
```

随后以隐藏输入保存凭据，再启动连续终端会话：

```powershell
ai4se-harness credentials init
ai4se-harness
```

当前命令所在目录就是 Agent 工作区；旧配置中的 `workspace` 不再切换目录。启动时只需输入一次主密码。进入 `ai4se>` 后可连续输入自然语言任务，并使用 `/help`、`/status`、`/trace`、`/clear`、`/exit`；每个写入动作仍会单独请求批准。`start --config` 与一次性任务入口 `ai4se-harness --task "任务" --config .ai4se/config.json` 保持兼容。

进入会话后可用以下任务检查真实 Provider 和文件读取：

```text
/status
请先使用 read_file 读取 README.md，然后用 finish 总结项目名称和用途。不要写文件，不要运行命令。
/trace
/exit
```

`/status` 显示的工作区应等于启动命令所在目录，任务应以 `completed` 结束，输出和 Trace 都不得包含 API Key。

只填写服务地址、隐藏 API Key 和模型名称的首次向导，以及会话内直接填写新模型名称的 `/model`，仍在开发中；在它们完成前，开发版仍需预先准备配置和旧式加密凭据。离线安装检查必须显式运行 `ai4se-harness smoke`。

也可以通过 ESM 导入：

```js
import { runInteractiveSession, runOfflineSmoke } from "@ai4se/harness";

console.log(await runOfflineSmoke());
```

该 tarball 通过 GitLab Release 分发，不代表已发布到公共 npm registry；项目暂未授予再分发许可证。
