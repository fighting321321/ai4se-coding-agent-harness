# AI4SE Coding Agent Harness 开发日志

## 文档用途

本文件按时间顺序记录项目中的任务、使用的 Superpowers Skill、关键 prompt 与 context、智能体产出、人工干预、提交证据和经验。记录必须与实际过程同步，不得事后补写虚假过程；尚未发生的动作必须明确标注为计划或待执行。为提高作业文档的可读性，项目负责人的口语化发言可以在不改变语义和决策的前提下整理，并明确标注为“整理后的表述”；不得把润色扩展为不存在的事实或决定。

## 记录格式

每条记录包含：

- 时间与任务编号
- 分支与基线提交
- 开发环境与使用的 Skill
- 关键 prompt / context 边界
- 智能体产出与人工决策
- 提交或验证证据
- 经验与下一步

## 时间线

### 2026-07-16 10:59:23 +08:00 · T01 启动

- 分支：`docs/t01-spec-design`
- 基线提交：`7c62c0c`（`docs: 规划T01需求探索步骤`）
- 主开发环境：OpenAI Codex App
- Superpowers：已启用；本地插件路径显示版本为 `6.1.1`，技能来源位于 `C:\Users\32175\.codex\plugins\cache\openai-curated-remote\superpowers\6.1.1\skills\`。
- 本轮使用的 Skill：`using-superpowers`、`brainstorming`。`brainstorming` 已触发，目前正在进行项目上下文探索并准备逐问逐答。
- 初始 prompt（整理后的表述）：`请阅读根目录的 guiding.md，并由当前对话负责完成 T01 的需求探索、过程记录与分支收尾。`
- 前置 context：用户先要求阅读 `guide/` 以理解项目目的，并明确忽略 `guiding.md`；随后在本轮授权读取 `guiding.md`，指定本对话负责 T01。
- context 边界：本轮只进行需求探索、过程记录和设计决策；禁止创建工程骨架、依赖配置、测试代码或任何业务实现。
- 当前人工决策：选择 A 方向 Coding Agent Harness；具体产品边界、目标用户、核心场景和主要贡献维度尚未确认。
- 已完成事实：检查了 `guiding.md`、根目录文件、Git 分支、工作区状态和近期提交；确认当前分支正确、提交 1 已存在、仓库尚无实现文件。
- 下一步：建立 `SPEC_PROCESS.md` 记录骨架后，按一次一个问题的方式确认用户价值与产品边界。
