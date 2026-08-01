# @ai4se/harness

课程项目使用的 Coding Agent Harness 内核分发包。它提供动作解析、工具分发、治理、反馈、记忆、Trace、LLM 抽象和 Agent 主循环。

本包要求 Node.js 24。课程交付包文件名为 `ai4se-harness-2.0.2.tgz`，正式入口为 GitLab v2.0.2 Release。下载后安装并运行完全离线且不读取凭据的 smoke：

```powershell
npm install --global .\ai4se-harness-2.0.2.tgz
ai4se-harness smoke
```

普通使用时，进入希望 Agent 操作的项目目录并直接运行：

```powershell
ai4se-harness
```

首次启动只依次填写服务地址、隐藏的 API Key 和模型名称；当前目录自动成为工作区，程序自动生成不含秘密的 `.ai4se/config.json`。API Key 由 Windows 当前用户范围的系统保护持久化，后续启动不询问主密码，也不重复询问 API Key。非 Windows 平台安全拒绝，不会明文降级。

服务地址、API Key 和模型名称会经过严格本地格式及非空校验；当前版本不声称执行 Provider 网络联通性或鉴权预检。真实连接结果在首次任务请求时确定。

进入 `ai4se>` 后可连续输入自然语言任务，并使用 `/help`、`/status`、`/model`、`/memory`、`/trace`、`/clear`、`/new`、`/exit`。写文件和未预授权的普通命令都会显示目标或完整命令并逐次请求批准；Shell 与删除类命令仍直接拒绝。

`credentials`、`start --config` 与一次性 `--task` 是旧式高级兼容入口，它们继续使用主密码凭据与显式配置，不属于普通流程。

进入会话后可用以下任务检查真实 Provider 和文件读取：

```text
/status
请先使用 read_file 读取 README.md，然后用 finish 总结项目名称和用途。不要写文件，不要运行命令。
/trace
/exit
```

`/status` 显示的工作区应等于启动命令所在目录，任务应以 `completed` 结束，输出和 Trace 都不得包含 API Key。

会话内可用 `/model 新模型名称` 保存新模型。离线安装检查必须显式运行 `ai4se-harness smoke`。

也可以通过 ESM 导入：

```js
import { runInteractiveSession, runOfflineSmoke } from "@ai4se/harness";

console.log(await runOfflineSmoke());
```

该 tarball 通过 GitLab Release 分发，不代表已发布到公共 npm registry；项目暂未授予再分发许可证。
