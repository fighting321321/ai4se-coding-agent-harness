# @ai4se/harness

课程项目使用的 Coding Agent Harness 内核分发包。它提供动作解析、工具分发、治理、反馈、记忆、Trace、LLM 抽象和 Agent 主循环。

本包要求 Node.js 24。课程交付包可从项目的 [v1.0.0 GitLab Release](https://git.nju.edu.cn/HuanghaoXu/ai4se-coding-agent-harness/-/releases/v1.0.0) 下载，文件名为 `ai4se-harness-0.1.0.tgz`。下载后安装并运行完全离线且不读取凭据的 smoke：

```powershell
pnpm add --global .\ai4se-harness-0.1.0.tgz
ai4se-harness smoke
```

也可以通过 ESM 导入：

```js
import { runOfflineSmoke } from "@ai4se/harness";

console.log(await runOfflineSmoke());
```

该 tarball 通过 GitLab Release 分发，不代表已发布到公共 npm registry；项目暂未授予再分发许可证。
