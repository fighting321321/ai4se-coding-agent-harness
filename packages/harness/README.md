# @ai4se/harness

课程项目使用的 Coding Agent Harness 内核分发包。它提供动作解析、工具分发、治理、反馈、记忆、Trace、LLM 抽象和 Agent 主循环。

本包要求 Node.js 24。安装本地 tarball 后可运行完全离线且不读取凭据的 smoke：

```text
ai4se-harness
```

也可以通过 ESM 导入：

```js
import { runOfflineSmoke } from "@ai4se/harness";

console.log(await runOfflineSmoke());
```

该 tarball 是课程交付产物，不代表已发布到公共 npm registry；项目暂未授予再分发许可证。
